import { getFlixEmbeds, getTmdbInfo, getAnilistInfo, searchReanimeAnime, getSyncInfo, resolveByDate } from './reanime.js';
import { extractFlixCloud } from './flixcloud.js';

async function getStreams(tmdbId, mediaType = "tv", season = null, episode = null) {
    try {
        if (mediaType !== 'tv' && mediaType !== 'movie') return [];

        let alId = null;
        let episodeNumber = mediaType === "tv" ? Number(episode || 1) : 1;
        let searchTitle = "";
        let searchYear = null;

        // Step 1: Resolve Metadata + Verified AniList ID
        if (typeof tmdbId === 'string' && tmdbId.indexOf('anilist:') === 0) {
            alId = tmdbId.split(':')[1];
        } else {
            console.log(`[Reanime] Resolving sync info for TMDB ${tmdbId}...`);
            try {
                const syncInfo = await getSyncInfo(tmdbId, mediaType, season, episodeNumber);
                searchTitle = syncInfo.title;
                
                const syncResult = await resolveByDate(syncInfo.releaseDate, syncInfo.title, episodeNumber, syncInfo.episodeTitle, syncInfo.dayIndex);
                if (syncResult && syncResult.alId) {
                    alId = String(syncResult.alId);
                    episodeNumber = syncResult.episode;
                    searchTitle = syncResult.title;
                    console.log(`[Reanime] Verified AniList ID: ${alId}, Episode: ${episodeNumber}`);
                }
            } catch (syncErr) {
                console.warn(`[Reanime] Sync info failed: ${syncErr.message}. Falling back to basic search.`);
            }

            if (!alId && !searchTitle) {
                try {
                    const tmdb = await getTmdbInfo(tmdbId, mediaType);
                    searchTitle = tmdb.title;
                    searchYear = tmdb.year;
                } catch (_) {}
            }
        }

        // Step 2: Try direct /api/flix lookup if AniList ID is available
        const embedsByLang = {};
        if (alId) {
            for (const lang of ["sub", "dub"]) {
                try {
                    const res = await getFlixEmbeds(null, episodeNumber, lang, alId);
                    if (res.embeds && res.embeds.length > 0) {
                        embedsByLang[lang] = res;
                    }
                } catch (_) {}
            }
        }

        // Step 3: Fallback to searching Reanime by title if direct lookup produced no embeds
        if (Object.keys(embedsByLang).length === 0) {
            if (!searchTitle && alId) {
                const alInfo = await getAnilistInfo(alId);
                searchTitle = alInfo.title;
                searchYear = alInfo.year;
            }

            if (searchTitle) {
                const anime = await searchReanimeAnime(searchTitle, searchYear, alId);
                if (anime) {
                    const slug = anime.slug;
                    const finalAlId = alId || anime.anilistId;
                    for (const lang of ["sub", "dub"]) {
                        try {
                            const res = await getFlixEmbeds(slug, episodeNumber, lang, finalAlId);
                            if (res.embeds && res.embeds.length > 0) {
                                embedsByLang[lang] = res;
                            }
                        } catch (_) {}
                    }
                }
            }
        }

        if (Object.keys(embedsByLang).length === 0) return [];

        const streams = [];

        for (const language of ["sub", "dub"]) {
            const embedInfo = embedsByLang[language];
            if (!embedInfo || !embedInfo.embeds) continue;

            const watchUrl = embedInfo.watchUrl;
            const embeds = embedInfo.embeds;

            for (let i = 0; i < embeds.length; i++) {
                try {
                    console.log(`[Reanime] Extracting locally: ${embeds[i]}`);
                    const extracted = await extractFlixCloud(embeds[i], watchUrl);
                    
                    console.log(`[Reanime] Successfully extracted: ${extracted.url}`);
                    const displayTitle = searchTitle || extracted.title || "Anime";
                    const streamTitle = mediaType === 'movie' 
                        ? `${displayTitle} (${language.toUpperCase()})`
                        : `${displayTitle} - Episode ${episodeNumber} (${language.toUpperCase()})`;

                    streams.push({
                        name: `Reanime ${language.toUpperCase()} HD-${i + 1}`,
                        title: streamTitle,
                        url: extracted.url,
                        quality: "Auto",
                        headers: extracted.headers,
                        provider: "reanime",
                        type: "m3u8",
                        subtitles: extracted.subtitles
                    });
                } catch (error) {
                    console.warn(`[Reanime] Local extraction failed: ${error.message}`);
                }
            }
        }

        const seen = new Set();
        return streams.filter(stream => {
            if (!stream.url || seen.has(stream.url)) return false;
            seen.add(stream.url);
            return true;
        });
    } catch (error) {
        console.error(`[Reanime] Error: ${error.message}`);
        if (error.stack) console.error(error.stack);
        return [];
    }
}

module.exports = { getStreams };
