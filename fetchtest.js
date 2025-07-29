import * as cheerio from 'cheerio';
import axios from 'axios';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchDataWithHeaders(url) {
  const headers = { 'User-Agent': 'fic-feed Discord bot developed by shantismurf@gmail.com' };
  let retryCount = 0;
  const maxRetries = 5;

  while (retryCount < maxRetries) {
    try {
      const response = await axios.get(url, { headers });
      const $ = cheerio.load(response.data);
      return $;
    } catch (error) {
      console.log(`Retrying in ${2 ** retryCount} seconds...`);
      retryCount++;
      if (retryCount === maxRetries) {
        console.error("Max retries exceeded");
        throw error;
      }
      await delay(2 ** retryCount * 1000); // Exponential backoff
    }
  }
}

async function main() {
  let url = '';
  url = 'https://archiveofourown.org/collections/BBC_MGE_2024';
  url = 'https://archiveofourown.org/collections/BagginshieldBookClub';
  url = 'https://archiveofourown.org/works/55997986';
  url = 'https://archiveofourown.org/works/63048829';
  url = 'https://archiveofourown.org/works/62565367';
  url = 'https://archiveofourown.org/works/55061758';
  url = 'https://archiveofourown.org/works/56651815';
  url = 'https://archiveofourown.org/works/64152013';
  try {
    const $ = await fetchDataWithHeaders(url);
    const metadata = {
      type: 'work',
      workTitle: $('h2.title.heading').text().trim(),
      workAuthor: $('h3.byline.heading a').map((_, a) => $(a).text()).get().join(', ')
    };
    console.log(metadata);
    const workauthorlength = 200;
    let authorstr = (metadata.workAuthor ?? 'None').substring(0, workauthorlength);
    authorstr = authorstr.length == workauthorlength ? authorstr + ' ...' : authorstr;
    
//    const authorUrl = authorstr.includes(',') ? null : 'http://archiveofourown.org/users/' + authorstr.replace(/\(.*$/, "").trim();
    const authorUrl = authorstr.includes(',') ? null : 'http://archiveofourown.org/users/' +
      // Extract the name inside parentheses if it exists, else use the whole string
      authorstr.match(/\((.*?)\)/)?.[1] ? authorstr.match(/\((.*?)\)/)[1] : authorstr;

      console.log(`
        name: 'A work by ' + ${authorstr},
        ...(${authorUrl} && { url: ${authorUrl})`);
  } catch (error) {
    console.error("Failed to fetch data:", error.message);
  }
}

main();