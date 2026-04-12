
export const WIKIDATA_USER_AGENT = 'QueerGuide/1.0 (https://queer.guide; contact@queer.guide)'

export async function fetchWikidataEntityLabel(entityId: string): Promise<string> {
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entityId}&format=json&props=labels&languages=en`
    const response = await fetch(url)
    const data = await response.json()
    return data.entities[entityId]?.labels?.en?.value || ''
  } catch {
    return ''
  }
}

export function formatWikidataDate(dateString: string | null): string | null {
  if (!dateString) return null
  try {
    const match = dateString.match(/^\+?(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      const year = match[1]
      const month = match[2] === '00' ? '01' : match[2]
      const day = match[3] === '00' ? '01' : match[3]
      return `${year}-${month}-${day}`
    }
  } catch (error) {
    console.error('Error formatting date:', error)
  }
  return null
}

export async function fetchOpenSanctionsData(name: string): Promise<unknown> {
  try {
    console.log(`Fetching OpenSanctions data for: ${name}`);

    // Search OpenSanctions API
    const searchUrl = `https://api.opensanctions.org/search/default?q=${encodeURIComponent(name)}&limit=5`;

    const response = await fetch(searchUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'QueerGuide/1.0 (https://queer.guide; contact@queer.guide)'
      }
    });

    if (!response.ok) {
      console.log(`OpenSanctions API returned ${response.status} for: ${name}`);
      return null;
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      console.log(`No OpenSanctions results found for: ${name}`);
      return null;
    }

    // Find the best match (exact name match or highest score)
    let bestMatch = null;
    let bestScore = 0;

    for (const result of data.results) {
      const resultName = result.properties?.name?.[0] || '';
      const score = result.score || 0;

      // Prefer exact name matches
      if (resultName.toLowerCase() === name.toLowerCase()) {
        bestMatch = result;
        break;
      }

      // Otherwise, take the highest scoring result
      if (score > bestScore) {
        bestMatch = result;
        bestScore = score;
      }
    }

    if (!bestMatch) {
      console.log(`No suitable OpenSanctions match found for: ${name}`);
      return null;
    }

    console.log(`Found OpenSanctions match for ${name}: ${bestMatch.properties?.name?.[0] || 'Unknown'}`);

    return {
      id: bestMatch.id,
      schema: bestMatch.schema,
      properties: bestMatch.properties,
      datasets: bestMatch.datasets || [],
      first_seen: bestMatch.first_seen,
      last_seen: bestMatch.last_seen,
      score: bestMatch.score
    };

  } catch (error) {
    console.error(`Error fetching OpenSanctions data for ${name}:`, error);
    return null;
  }
}

export async function fetchTopBook(authorName: string): Promise<string | null> {
  try {
    // Search for the author in Open Library
    const searchUrl = `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(authorName)}&limit=1`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    if (!searchData.docs || searchData.docs.length === 0) {
      console.log(`No Open Library author found for: ${authorName}`);
      return null;
    }

    const author = searchData.docs[0];
    const authorKey = author.key;

    if (!authorKey) {
      return null;
    }

    // Get author's works
    const worksUrl = `https://openlibrary.org/authors/${authorKey}/works.json?limit=50`;
    const worksResponse = await fetch(worksUrl);
    const worksData = await worksResponse.json();

    if (!worksData.entries || worksData.entries.length === 0) {
      console.log(`No works found for author: ${authorName}`);
      return null;
    }

    // Find the most popular work (highest edition count or first in list)
    let topWork = null;
    let maxEditions = 0;

    for (const work of worksData.entries.slice(0, 20)) { // Check first 20 works
      const workKey = work.key;

      try {
        // Get work details to find edition count
        const workUrl = `https://openlibrary.org${workKey}.json`;
        const workResponse = await fetch(workUrl);
        const workData = await workResponse.json();

        // Count editions by checking covers or simply use the work if it has a title
        if (workData.title) {
          const editionCount = workData.covers ? workData.covers.length : 1;

          if (editionCount > maxEditions || !topWork) {
            maxEditions = editionCount;
            topWork = workData.title;
          }
        }
      } catch (error) {
        console.log(`Error fetching work details for ${workKey}:`, error);
        // If we can't get details, just use the first work with a title
        if (work.title && !topWork) {
          topWork = work.title;
        }
      }
    }

    if (topWork) {
      console.log(`Found top book for ${authorName}: ${topWork}`);
      return topWork;
    }

    return null;
  } catch (error) {
    console.error(`Error fetching top book for ${authorName}:`, error);
    return null;
  }
}

export async function fetchUpcomingConcerts(artistName: string): Promise<unknown[] | null> {
  try {
    // Clean artist name for search (remove common suffixes that might interfere)
    const cleanedName = artistName
      .replace(/\s*\(.*?\).*$/, '') // Remove parenthetical content
      .trim();

    console.log(`Searching for concerts for: ${cleanedName}`);

    // Search for the artist on Bandsintown
    const artistSearchUrl = `https://rest.bandsintown.com/artists/${encodeURIComponent(cleanedName)}?app_id=queer-guide`;
    const artistResponse = await fetch(artistSearchUrl);

    if (!artistResponse.ok) {
      console.log(`No artist found on Bandsintown for: ${cleanedName}`);
      return null;
    }

    const artistData = await artistResponse.json();

    if (!artistData || artistData.error) {
      console.log(`Artist not found on Bandsintown: ${cleanedName}`);
      return null;
    }

    // Get upcoming events for the artist
    const eventsUrl = `https://rest.bandsintown.com/artists/${encodeURIComponent(cleanedName)}/events?app_id=queer-guide&date=upcoming`;
    const eventsResponse = await fetch(eventsUrl);

    if (!eventsResponse.ok) {
      console.log(`No events found for artist: ${cleanedName}`);
      return null;
    }

    const eventsData = await eventsResponse.json();

    if (!Array.isArray(eventsData) || eventsData.length === 0) {
      console.log(`No upcoming events for ${cleanedName}`);
      return null;
    }

    // Format the concert data - take first 5 upcoming events
    const concerts = eventsData.slice(0, 5).map(event => ({
      id: event.id,
      datetime: event.datetime,
      venue: {
        name: event.venue?.name || 'TBA',
        city: event.venue?.city || 'TBA',
        country: event.venue?.country || 'TBA',
        region: event.venue?.region || '',
      },
      lineup: event.lineup || [cleanedName],
      offers: event.offers || [],
      url: event.url || event.facebook_rsvp_url || '',
      description: event.description || '',
      on_sale_datetime: event.on_sale_datetime || null
    }));

    console.log(`Found ${concerts.length} upcoming concerts for ${cleanedName}`);
    return concerts;

  } catch (error) {
    console.error(`Error fetching concerts for ${artistName}:`, error);
    return null;
  }
}
