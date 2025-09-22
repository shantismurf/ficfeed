import * as cheerio from 'cheerio';
import axios from 'axios';
import { DiscordClient, formattedDate, testEnvironment } from './utilities.js';
const client = DiscordClient.getInstance();
import config from './config.json' with {type: 'json'};
const test = testEnvironment(); //set in utilities.js
const FEEDID = test ? config.TESTFEEDID : config.FEEDID;
const GUILD = config.GUILD;

export async function fetchDataWithHeaders(url, channelID, message) {
    const feedChannel = client.channels.cache.get(channelID);
    let msgID, msgAuthor, msgChannel, msgText;
    if (message) { 
        msgID = message.id;
        msgAuthor = message.author.displayName;
        msgChannel = message.channel.id;
        msgText = `\n<${url}> posted by ${msgAuthor} in https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`;
    } else { //wordcount command does not pass a message object
        msgID = '';
        msgAuthor = '';
        msgChannel = feedChannel;
        msgText = `wordcount for <${url}>`;
    }
    const headers = { 'User-Agent': 'ficfeed: link aggregating Discord bot developed by shantismurf@gmail.com' };
    let retryMessage = await feedChannel.send(`Please wait. Processing ${msgText}`);
    let retryCount = 0;
    let maxRetries = 5;
    let delay = 1000; // delay in milliseconds
    while (retryCount < maxRetries) {
        try {
            const response = await axios.get(url, { headers });
            const $ = cheerio.load(response.data);
            // Delete the retry message after a successful fetch
            if (retryMessage) {
                await retryMessage.delete();
                console.log(`***Erased wait message at ${formattedDate()}`);
            }
            return $;
        } catch (error) {
            const errorMessage = error.response?.data ? `${error.response.headers.server} ${error.response.status} error` : error.message.slice(0, 100); 
            // Update the retry message with the error
            if (error.response && error.response.headers['retry-after']) {
                const retryAfter = parseInt(error.response.headers['retry-after']);
                console.log(`***Retry index ${retryCount} at ${formattedDate()}: Retrying in ${retryAfter} seconds...\n${errorMessage}`);
                await retryMessage.edit(`Please wait. Processing ${msgText}\nAO3 is rate limiting. Retrying in ${retryAfter} seconds...`);
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            } else {
                console.log(`***Retry index ${retryCount}, delay ${delay} at ${formattedDate()}\n${errorMessage}`);
                await retryMessage.edit(`Please wait. Processing ${msgText}\nRetry attempt ${retryCount + 1} of ${maxRetries}, delay ${delay}`);
                await new Promise(resolve => setTimeout(resolve, delay)); 
            }
            // If it's any server error (5xx), double the delay and increase max retries
            if (/5\d{2}/.test(String(error))) { 
                delay *= 2;
                maxRetries++;
            }
            retryCount++;
            if (maxRetries > 10) { retryCount = maxRetries; } // Prevents infinite loop
            if (retryCount === maxRetries) {
                let errorMsg = `Max retries exceeded while processing ${msgText} (${errorMessage}). `;
                if (/418/.test(String(error))) { 
                errorMsg += `The Archive is temporarily limiting bot traffic. Try again later.`
            } else {
                errorMsg += `Archive is unavailable.`
                }
                console.error(`*!*!*!Max retries exceeded at ${formattedDate()}:\n${errorMessage}`);
                await retryMessage.edit(errorMsg);
                throw error; // Rethrow the error so it can be caught by the caller
            }
        }
    }
}

export default async function ao3api(link, message) {
    let metadata = {};
    metadata.exists = false;
    try {
        const $ = await fetchDataWithHeaders(link, FEEDID, message);
        //check if link is for works, series, or collections
        if (link.includes("works")) {
            metadata.type = 'work';
            if ($('h2.landmark.heading').text().trim() == 'Adult Content Warning') {
                //M and E fics have a different layout when not logged in
                metadata.AdultContentWarning = true;
                const authors = $('h4.heading a').map((_, a) => $(a).text()).get();
                metadata.workTitle = authors[0];
                metadata.workAuthor = authors.slice(1).join(', ');
                metadata.workRating = $('span.rating').text();
                metadata.workWarning = $('span.warnings').text();
                metadata.workCategory = $('span.category').text();
                const relationships = $('li.relationships a').map((_, a) => $(a).text()).get();
                metadata.workRelationship = relationships.join(relationships.length > 1 ? ', ' : '');
                const characters = $('li.characters a').map((_, a) => $(a).text()).get();
                metadata.workCharacters = characters.join(characters.length > 1 ? ', ' : '');
                const freeforms = $('li.freeforms a').map((_, a) => $(a).text()).get();
                metadata.workFreeform = freeforms.join(freeforms.length > 1 ? ', ' : '');
                const fandoms = $('h5.fandoms.heading a').map((_, a) => $(a).text()).get();
                metadata.workFandom = fandoms.join(fandoms.length > 1 ? ', ' : '');
                metadata.workLanguage = $('dd.language').text();
                let dateObj = new Date($('p.datetime').text());
                metadata.workPublished = dateObj.toISOString().split('T')[0];
                metadata.workChapters = $('dd.chapters').text();
                metadata.workStatus = metadata.workChapters == '1/1' ? 'Completed' : $('dt.status')?.text()?.slice(0, -1) ?? '';
                metadata.workStatusDate = $('dd.status').text() ? $('dd.status').text() : metadata.workPublished;
                metadata.workBookmarks = $('dd.bookmarks a').text();
                metadata.workWords = $('dd.words').text();
                metadata.workComments = $('dd.comments').text();
                metadata.workKudos = $('dd.kudos').text();
                metadata.workHits = $('dd.hits').text();
                const seriesText = $('ul.series li').text();
                if (seriesText) {
                    const linkText = seriesText.substring(seriesText.indexOf('of') + 3);
                    const linkUrl = $('ul.series li a').attr('href');
                    metadata.workSeries = seriesText.replace(/of (.*)/, `of [${linkText}](https://archiveofourown.org${linkUrl})`);
                }
                metadata.workSummary = $('blockquote.userstuff.summary').html();
            } else { //no adult content warning
                metadata.workTitle = $('h2.title.heading').text().trim();
                const authors = $('h3.byline.heading a').map((_, a) => $(a).text()).get();
                metadata.workAuthor = authors.join(authors.length > 1 ? ', ' : '');
                metadata.workRating = $('dd.rating ul li a').text();
                const fields = [
                    { selector: 'dd.warning.tags', field: 'workWarning' },
                    { selector: 'dd.category', field: 'workCategory' },
                    { selector: 'dd.fandom', field: 'workFandom' },
                    { selector: 'dd.relationship', field: 'workRelationship' },
                    { selector: 'dd.character', field: 'workCharacters' },
                    { selector: 'dd.freeform', field: 'workFreeform' },
                ];
                fields.forEach(({ selector, field }) => {
                    const values = $(selector).find('a').map((_, a) => $(a).text()).get();
                    metadata[field] = values.join(values.length > 1 ? ', ' : '');
                });
                metadata.workLanguage = $('dd.language').text().trim();
                metadata.workPublished = $('dd.published').text();
                metadata.workChapters = $('dd.chapters').text();
                //status does not appear if the work only has one chapter, use 'Completed' label and published date
                metadata.workStatus = metadata.workChapters == '1/1' ? 'Completed' : $('dt.status')?.text()?.slice(0, -1) ?? '';
                metadata.workStatusDate = $('dd.status').text() ? $('dd.status').text() : metadata.workPublished;
                metadata.workBookmarks = $('dd.bookmarks a').text();
                metadata.workWords = $('dd.words').text();
                metadata.workComments = $('dd.comments').text();
                metadata.workKudos = $('dd.kudos').text();
                metadata.workHits = $('dd.hits').text();
                const seriesText = $('dd.series span.position').text();
                if (seriesText) {
                    const linkText = seriesText.substring(seriesText.indexOf('of') + 3);
                    const linkUrl = $('dd.series span.position a').attr('href');
                    metadata.workSeries = seriesText.replace(/of (.*)/, `of [${linkText}](https://archiveofourown.org${linkUrl})`);
                }
                metadata.workSummary = $('.summary blockquote').html()?.trim() ?? '';
            }
            // if title is not found send the restricted message to the server
            if (metadata.workTitle == '') {
                console.log(`*!*!*!${metadata.type} title not found at ${formattedDate()}`);
                metadata.setError = `${metadata.type} restricted`;
                //console.log(`*!*!*!metadata:${JSON.stringify(metadata)}`);
                return metadata;
            };
        } else if (link.includes("series")) {
            metadata.type = 'series';
            metadata.seriesTitle = $('h2.heading').text().trim();
            // if title is not found send the restricted message to the server
            if (metadata.seriesTitle == '') {
                console.log(`*!*!*!${metadata.type} title not found at ${formattedDate()}`);
                metadata.setError = `${metadata.type} not available`;
                return metadata;
            };
            metadata.seriesCreator = $('.series.meta.group dt:contains("Creator")').next().text();
            metadata.seriesBegun = $('.series.meta.group dt:contains("Series Begun:")').next().text();
            metadata.seriesUpdated = $('.series.meta.group dt:contains("Series Updated:")').next().text();
            metadata.seriesDescription = $('.series.meta.group dt:contains("Description:")').next().html().trim();
            metadata.seriesWords = $('.series.meta.group dt:contains("Words:")').next().text();
            metadata.seriesWorks = $('.series.meta.group dt:contains("Works:")').next().text();
            metadata.seriesBookmarks = !$('.series.meta.group dt:contains("Bookmarks:")').next().text() ? '0' : $('.series.meta.group dt:contains("Bookmarks:")').next().text();
            metadata.seriesComplete = $('.series.meta.group dt:contains("Complete:")').next().text();
            // build list of works, sliced to only show 5 instead of 20 works
            let tag = $('ul.series.work.index.group');
            let seriesWorkList = '';
            tag.find('li[role="article"]').each((index, li) => {
                const h4 = $(li).find('h4.heading');
                const links = h4.find('a');
                const itemTitle = $(links[0]).text().trim();
                const itemAuthor = links.length > 1 ? 'multiple authors' : $(links[1]).text();
                if (itemTitle.length > 0) {
                    const itemRating = $(li).find('span.rating');
                    seriesWorkList += '- [' +
                        itemTitle + '](https://archiveofourown.org/' +
                        $(links[0]).attr('href') + ') by ' +
                        itemAuthor + ' (' +
                        itemRating.attr('title').substring(0, 1) + ')\n';
                }
                if (test) console.log(`***seriesWorkList ${index}: ${seriesWorkList}`);
            });
            metadata.seriesWorkList = seriesWorkList;

        } else if (link.includes("collections")) {
            metadata.type = 'collection';
            metadata.collectionTitle = $('h2.heading').text().trim();
            // if title is not found send the restricted message to the server
            if (metadata.collectionTitle == '') {
                console.log(`*!*!*!${metadata.type} title not found at ${formattedDate()}`);
                metadata.setError = `${metadata.type} not available`;
                return metadata;
            };
            let tag = $('div#dashboard');
            tag = tag.find('ul.navigation.actions').first();
            tag.find('li').each((index, li) => {
                const a = $(li).find('a');
                const links = Array.from(a);
                const variablename = 'collectionStats' + index;
                metadata[variablename] = $(links[0]).text();
            });
            metadata.collectionSubcollections = metadata.collectionStats2;
            tag = tag.nextAll('ul.navigation.actions').first();
            tag.find('li').each((index, li) => {
                const a = $(li).find('a');
                const links = Array.from(a);
                const variablename = 'collectionStats' + index;
                metadata[variablename] = $(links[0]).text();
            });
            const listCount = $('ul.index.group').find('li')
            let collectionWorkList = '';
            if (listCount.length == 0) {
                collectionWorkList = 'No items found in collection';
            } else {
                $('ul.index.group').find('li').each((index, li) => {
                    const h4 = $(li).find('h4.heading');
                    const links = Array.from(h4.find('a'));
                    const itemTitle = $(links[0]).text();
                    const itemAuthor = $(links[1]).text();
                    if (itemTitle.length > 0) {
                        const itemRating = $(li).find('span.rating');
                        collectionWorkList = collectionWorkList.concat('- [' + itemTitle + '](https://archiveofourown.org/' + $(links[0]).attr('href') + ') by ' + itemAuthor + ' (' + itemRating.attr('title').substring(0, 1) + ')\n');
                    }
                });
            }
            metadata.collectionWorkList = collectionWorkList;
            metadata.collectionFandoms = metadata.collectionStats0;
            metadata.collectionWorks = metadata.collectionStats1;
            metadata.collectionBookmarkedItems = metadata.collectionStats2;
            delete metadata.collectionStats0;
            delete metadata.collectionStats1;
            delete metadata.collectionStats2;
            delete metadata.collectionStats3;
            delete metadata.collectionStats4;
            delete metadata.collectionStats5;
            metadata.collectionListboxHeading = !$('div.listbox.group h3.heading')?.text()?.trim() ? '\t' : $('div.listbox.group h3.heading').text().trim();
            metadata.collectionType = $('p.type').text().match(/\((.*)\)/)[1];
            metadata.collectionImage = $('div.icon').find('img').attr('src');
            metadata.collectionDescription = $('div.primary.header.module').find('blockquote.userstuff').html().trim();
        }
        metadata.exists = true;
        //console.log(`***metadata: ${JSON.stringify(metadata)}`);
        return metadata;
    } catch (error) {
        if (link.includes("works")) {
            metadata.type = 'work';
        } else if (link.includes("series")) {
            metadata.type = 'series';    
        } else if (link.includes("collections")) {
            metadata.type = 'collection';
        }
        console.log(`*!*!*!${metadata.type} Link ${link} failed to be processed at ${formattedDate()}.`);
        const errorMessage = error.response?.data ? `${error.response.headers.server} ${error.response.status} error` : error.message.slice(0, 100); 
        console.log(errorMessage)
        return { error: error, type: metadata.type } // Pass the type attribute along with the error
    }
}