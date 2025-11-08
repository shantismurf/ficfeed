import * as cheerio from 'cheerio';
import axios from 'axios';
import { EmbedBuilder } from 'discord.js';
import { DiscordClient, formattedDate, testEnvironment, userStats, sanitize } from './utilities.js';
const client = DiscordClient.getInstance();
import config from './config.json' with {type: 'json'};
const test = testEnvironment(); //set in utilities.js
const FEEDID = test ? config.TESTFEEDID : config.FEEDID;
const ADULTFEEDID = test ? config.TESTADULTFEEDID : config.ADULTFEEDID;
const GUILD = config.GUILD;

async function fetchDataWithHeaders(url, channelID, message) {
    const feedChannel = client.channels.cache.get(channelID);
    let msgID, msgAuthor, msgChannel, msgText;
    // Clean up collections and series URLs - remove everything after the name
    if (url.includes("/collections/") || url.includes("/series/")) {
        const parts = url.split('/');
        const typeIndex = parts.findIndex(part => part === 'collections' || part === 'series');
        if (typeIndex !== -1 && parts[typeIndex + 1]) {
            // Keep only up to: /collections/name or /series/name
            url = parts.slice(0, typeIndex + 2).join('/');
        }
    }
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

async function ao3api(link, message) {
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
            metadata.seriesTitle = $('h2.heading').text();
            // if title is not found send the restricted message to the server
            if (metadata.seriesTitle == '') {
                console.log(`*!*!*!${metadata.type} title not found at ${formattedDate()}`);
                metadata.setError = `${metadata.type} not available`;
                return metadata;
            };
            metadata.seriesCreator = $('.series.meta.group dt:contains("Creator")').next().text();
            metadata.seriesBegun = $('.series.meta.group dt:contains("Series Begun:")').next().text();
            metadata.seriesUpdated = $('.series.meta.group dt:contains("Series Updated:")').next().text();
            metadata.seriesDescription = $('.series.meta.group dt:contains("Description:")').next().html();
            metadata.seriesWords = $('.series.meta.group dt:contains("Words:")').next().text();
            metadata.seriesWorks = $('.series.meta.group dt:contains("Works:")').next().text();
            metadata.seriesBookmarks = !$('.series.meta.group dt:contains("Bookmarks:")').next().text() ? '0' : $('.series.meta.group dt:contains("Bookmarks:")').next().text();
            metadata.seriesComplete = $('.series.meta.group dt:contains("Complete:")').next().text();
            // build list of works, sliced to only show 5 instead of 20 works
            let tag = $('ul.series.work.index.group');
            let seriesWorkList = '';
            //tag.find('li[role="article"]').each((index, li) => { 
            tag.find('li[role="article"]:not([class*="mystery"])').each((index, li) => {
                const h4 = $(li).find('h4.heading');
                const links = h4.find('a');
                const itemTitle = $(links[0]).text().trim();
                const itemAuthor = links.length > 2 ? 'multiple authors' : $(links[1]).text();
                //const itemAuthor = $(links[1]).text();
                if (itemTitle.length > 0) {
                    const itemRating = $(li).find('span.rating');
                    const ratingType = itemRating.attr('title') || '-';
                    seriesWorkList += '- [' +
                        itemTitle + '](https://archiveofourown.org/' +
                        $(links[0]).attr('href') + ') by ' +
                        itemAuthor + ' (' +
                        ratingType.substring(0, 1) + ')\n'; 
                }
                if (test) console.log(`***seriesWorkList ${index}: ${seriesWorkList}`);
            });
            metadata.seriesWorkList = seriesWorkList;

        } else if (link.includes("collections")) {
            if (test) console.log(`ao3api link.includes collections`);
            metadata.type = 'collection';
            if (test) console.log(`01 - ${JSON.stringify(metadata)}`);
            metadata.collectionTitle = $('h2.heading').text().trim();
            if (test) console.log(`02 - ${JSON.stringify(metadata)}`);
            // if title is not found send the restricted message to the server
            if (metadata.collectionTitle == '') {
                console.log(`*!*!*!${metadata.type} title not found at ${formattedDate()}`);
                metadata.setError = `${metadata.type} not available`;
                return metadata;
            };
            
            // Dynamic collection statistics parsing - inline logic
            $('ul.navigation.actions a, div.navigation a').each((i, link) => {
                const text = $(link).text().trim();
                const match = text.match(/([^(]+)\s*\((\d+)\)/);
                
                if (match && parseInt(match[2]) > 0) {
                    // Convert "Bookmarked Items" to "BookmarkedItems" 
                    const statName = match[1].trim()
                        .split(/\s+/)
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join('');
                    
                    const fieldName = `${metadata.type}${statName}`;
                    metadata[fieldName] = { 
                        label: fieldName, 
                        display: text 
                    };
                }
            });
            
            // Build collection work list
            const listCount = $('ul.index.group').find('li');
            let collectionWorkList = '';
            if (listCount.length == 0) {
                collectionWorkList = 'No items found in collection';
            } else {
                $('ul.index.group').find('li').each((index, li) => {
                    const h4 = $(li).find('h4.heading');
                    const links = Array.from(h4.find('a'));
                    const itemTitle = $(links[0])?.text() || '';
                    const itemAuthor = links.length > 1 ? $(links[1])?.text() || '-' : '-';
                    if (itemTitle.length > 0) {
                        const itemRating = $(li).find('span.rating');
                        const ratingType = itemRating.attr('title') || '-';
                        collectionWorkList += `- [${itemTitle}](https://archiveofourown.org${$(links[0]).attr('href')}) by ${itemAuthor} (${ratingType.substring(0, 1)})\n`;
                    }
                });
            }
            metadata.collectionWorkList = collectionWorkList;
            
            // Parse other collection metadata
            metadata.collectionListboxHeading = $('div.listbox.group h3.heading')?.text()?.trim() || '\t';
            metadata.collectionType = $('p.type').text().match(/\((.*)\)/)?.[1] || '-';
            metadata.collectionImage = $('div.icon').find('img').attr('src');
            metadata.collectionDescription = $('div.primary.header.module').find('blockquote.userstuff').html()?.trim();
            
            if (test) {
                console.log(`Dynamic collection stats found:`, Object.keys(metadata).filter(key => key.startsWith('collection') && typeof metadata[key] === 'object'));
            }
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

export async function buildEmbed(linkURL, message) {    
    const msgID = message.id;
    const msgAuthor = message.author.id;
    const msgChannel = message.channel.id;
    let responseText;
    try {
        //ao3api extracts data from ao3 html code into json object
        const ao3 = await ao3api(linkURL, message);
        const feedChannel = client.channels.cache.get(FEEDID);
        const adultFeedChannel = client.channels.cache.get(ADULTFEEDID);
        const stats = userStats();
        const processAdultLinks = stats.processAdultLinks;
        const workauthorlength = stats.workauthorlength;
        const worksummarylength = stats.worksummarylength; 
        const worktaglength = stats.worktaglength; 
        const seriesdesclength = stats.seriesdesclength;
        const worktitlelength = stats.worktitlelength;
        const silentFlag = stats.silent;
        const linkType = (!ao3.type ? 'link' : ao3.type);
        if (ao3.setError) {
            console.log(`*!*!*!Restricted work or error at ${formattedDate()}`);
            //link is restricted or unavailable 
            const errorCode = ao3.error ? (/code\s.*/.exec(ao3.error)?.[0] ?? ao3.setError) : 'Error unavailable';
            responseText = new EmbedBuilder()
                .setColor(0x808080)
                //.setTitle(`Preview not available. The ${linkType} may be restricted or unavailable. Click here to view.
                //    \n(${ao3.error?.match(/code\s.*/)?.[0] ?? 'Restricted'})`)
                .setTitle(`Preview not available. The ${linkType} may be restricted or the Archive is unavailable. Click here to view.\n(${errorCode})\n`)
                .setURL(linkURL)
                .setDescription(`Link posted by <@${msgAuthor}> in https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`)
        } else {
            if (linkType == 'work') {
                //set limits on authors, summary and tag string lengths and append ellipsis if truncated
                let authorstr = (ao3.workAuthor ?? 'None').substring(0, workauthorlength);
                authorstr = authorstr.length == workauthorlength ? authorstr + ' ...' : authorstr;
                let summarystr = (ao3.workSummary ?? 'None').substring(0, worksummarylength);
                summarystr = summarystr.length == worksummarylength ? summarystr + ' ...' : summarystr;
                let tagstr = (ao3.workFreeform && ao3.workFreeform.trim() !== '' ? ao3.workFreeform : 'None').substring(0, worktaglength);
                tagstr = tagstr.length === worktaglength ? tagstr + ' ...' : tagstr;
                if (test) console.log(`00-tagstr: ${tagstr}`);
                let ratingstr = //shorten rating text, just cause its annoying
                    ao3.workRating === "General Audiences" ? "General" :
                    ao3.workRating === "Teen And Up Audiences" ? "Teen" :
                    ao3.workRating;
                responseText = new EmbedBuilder()
                    .setColor(
                        ({ //compare text to ratingstr and set the appropriate color
                            "Not Rated": 0x808080,
                            "General": 0x0000FF,
                            "Teen": 0x008000,
                            "Mature": 0xFFA500,
                            "Explicit": 0xFF0000
                        })[ratingstr]
                    )
                    .setTitle(ao3.workTitle.substring(0, worktitlelength))
                    .setURL(linkURL);
                const authorstrmatch = authorstr.match(/\((.*?)\)/)?.[1]; //check for pseudonym in parentheses
                const authorUrl = authorstr.includes(',')
                    ? null //build url only if single author, use psuedonym if present
                    : `http://archiveofourown.org/users/${authorstrmatch ? authorstrmatch : authorstr.trim()}`;

                responseText.setAuthor({
                    name: 'A work by ' + authorstr,
                    ...(authorUrl && { url: authorUrl }) //only add link to single author
                });
                responseText.setDescription(
                    ` Link posted by <@${msgAuthor}> in https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`
                );
                if (ao3.workSeries) {// != '') { 
                    responseText.addFields({
                        name: '\t',
                        value: sanitize(ao3.workSeries) //in value because string contains link
                    });
                }
                if (test) console.log(`01-series: ${ao3.workSeries}`);
                responseText.addFields(
                    {
                        name: ao3.AdultContentWarning ? ao3.workStatus : 'Published | ' + ao3.workStatus,
                        value: ao3.AdultContentWarning ? ao3.workPublished : ao3.workPublished + ' | ' + ao3.workStatusDate,
                        inline: true
                    });
                if (test) console.log(`02-dates: ${ao3.workPublished} | ${ao3.workStatusDate}`);
                responseText.addFields(
                    {
                        name: 'Words | Chapters',
                        value: ao3.workWords + ' | ' + ao3.workChapters,
                        inline: true
                    });
                if (test) console.log(`03-words: ${ao3.workWords} | ${ao3.workChapters}`);
                responseText.addFields(
                    {//compare text to ratingstr and set the appropriate icon
                        name: 'Rating | Warning',
                        value: ({
                            "Not Rated": ':black_circle: ',
                            "General": ':blue_circle: ',
                            "Teen": ':green_circle: ',
                            "Mature": ':yellow_circle: ',
                            "Explicit": ':red_circle: '
                        })[ratingstr] + ratingstr + ' | ' +
                            ao3.workWarning.substring(0, 75) // limited only for the crazy situation that someone picks all the warnings 
                    });
                if (test) console.log(`04-rating: ${ratingstr} | ${ao3.workWarning}`);
                responseText.addFields(
                    {
                        name: 'Fandom',
                        value: sanitize(ao3.workFandom),
                        inline: true
                    });
                if (test) console.log(`05-fandom: ${ao3.workFandom}`);
                responseText.addFields(
                    {
                        name: 'Category',
                        value: (ao3.workCategory ? ao3.workCategory : '\t'),
                        inline: true
                    });
                if (test) console.log(`06-category: ${ao3.workCategory}`);
                responseText.addFields( //blank field to make two column line break
                    {
                        name: '\t',
                        value: '\t'
                    });
                responseText.addFields(
                    {
                        name: 'Relationship',
                        value: (ao3.workRelationship ? sanitize(ao3.workRelationship) : '\t'),
                        inline: true
                    });
                if (test) console.log(`07-Relationship: ${ao3.workRelationship}`);    
                responseText.addFields(
                    {
                        name: 'Character',
                        value: (ao3.workCharacters ? sanitize(ao3.workCharacters) : '\t'),
                        inline: true
                    });
                if (test) console.log(`08-Character: ${ao3.workCharacters}`);
                responseText.addFields(
                    {
                        name: 'Tags',
                        value: sanitize((tagstr == null ? '\t' : tagstr))
                    });
                if (test) console.log(`09-tags: ${tagstr}`);
                responseText.addFields(
                    {
                        name: 'Summary',
                        value: sanitize((summarystr == null ? '\t' : summarystr))
                    }
                )
                    .setFooter({
                        text: 'Kudos: ' + (ao3.workKudos ?? 0) +
                            ' | Comments: ' + (ao3.workComments ?? 0) +
                            ' | Bookmarks: ' + (ao3.workBookmarks ?? 0) +
                            ' | Hits: ' + (ao3.workHits ?? 0)
                    });
                    if (test) console.log(`10-footer: ${tagstr}`);
            } else if (linkType == 'series') {
                if (test) console.log(`index linkType series`);
                //set limits on description string length and append elipsis if truncated
                let descriptionstr = (ao3.seriesDescription ?? 'None').substring(0, seriesdesclength);
                descriptionstr = descriptionstr.length == seriesdesclength ? descriptionstr + ' ...' : descriptionstr;
                if (test) console.log(`01 - ${descriptionstr}`);
                let authorstr = (ao3.seriesCreator ?? 'None').substring(0, workauthorlength);
                authorstr = authorstr.length == workauthorlength ? authorstr + ' ...' : authorstr;
                if (test) console.log(`02 - ${authorstr}`);
                responseText = new EmbedBuilder()
                    .setColor(0xD7A9F1)
                    .setTitle(ao3.seriesTitle)
                    .setURL(linkURL)
                    .setDescription(
                        `:purple_circle: Link posted by <@${msgAuthor}> ` +
                        `in https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`
                    );
                responseText.setDescription(
                    ` Link posted by <@${msgAuthor}> in ` +
                    `https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`
                );
                if (test) console.log(`02 - ${JSON.stringify(responseText)}`);
                //build url without psuedonyms
                const authorUrl = authorstr.includes(',') ? null : 'http://archiveofourown.org/users/' + authorstr.replace(/\(.*$/, "");
                responseText.setAuthor({
                    name: 'A series by ' + ao3.seriesCreator,
                    ...(authorUrl && { url: authorUrl }) //only add link to single author
                });
                if (test) console.log(`03 - ${JSON.stringify(responseText)}`);
                responseText.addFields(
                    {
                        name: 'Date Begun | Date Updated',
                        value: ao3.seriesBegun + ' | ' + ao3.seriesUpdated
                    },
                    {
                        name: 'Description',
                        value: (descriptionstr == '' ? '\t' : sanitize(descriptionstr))
                    },
                    {
                        name: 'Words | Works',
                        value: `${ao3.seriesWords} words in ${ao3.seriesWorks}` + (ao3.seriesWorks > 1 ? ' works' : ' work')
                    }
                );
                if (test) console.log(`04 - ${JSON.stringify(responseText)}`);
                let worksList = ao3.seriesWorkList;
                if (worksList.length > 1024) {
                    // Split by lines and rebuild until char limit
                    const entries = worksList.split('\n');
                    let truncated = '';
                    for (const entry of entries) {
                        if ((truncated + entry + '\n').length > 1020) { // Leave room for "..."
                            break;
                        }
                        truncated += entry + '\n';
                    }
                    worksList = truncated + '...';
                }
                responseText.addFields({
                    name: 'Works:',
                    value: worksList,
                });
                if (test) console.log(`05 - ${JSON.stringify(responseText)}`);
                responseText.setFooter({
                    text: 'Complete: ' + ao3.seriesComplete + ' | Bookmarks: ' + (ao3.seriesBookmarks ?? 0)
                })
            } else if (linkType == 'collection') {
                if (test) console.log(`index linkType collection`); 
                responseText = new EmbedBuilder();
                responseText.setColor(0xFF6600);
                responseText.setTitle(ao3.collectionTitle);
                responseText.setURL(linkURL);
                responseText.setDescription(`:orange_circle: Link posted by <@${msgAuthor}> in https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`);
                responseText.addFields(
                    {
                        name: 'Description:',
                        value: (ao3.collectionDescription ? sanitize(ao3.collectionDescription) : '\t')
                    });
                if (test) console.log(`01 - ${JSON.stringify(responseText)}`); 
                responseText.addFields(
                    {
                        name: '--------------------',
                        value: '-# *Restricted works are not included in counts*'
                    });
                if (test) console.log(`02 - ${JSON.stringify(responseText)}`);
                
                // Dynamically build collection statistics from any found stats
                const collectionStatsList = [];
                Object.entries(ao3).forEach(([key, value]) => {
                    if (key.startsWith('collection') && value && typeof value === 'object' && value.display) {
                        collectionStatsList.push(value.display);
                    }
                });
                
                responseText.addFields({
                    name: 'Collection Stats:',
                    value: collectionStatsList.length > 0 ? collectionStatsList.join(', ') : 'None',
                });
                if (test) console.log(`03 - ${JSON.stringify(responseText)}`);
               /* responseText.addFields(
                    {
                        name: '\t',
                        value: (ao3.collectionSubcollections || '') + ', ' + (ao3.collectionFandoms || '')
                    }); */
                responseText.addFields(
                    {
                        name: ao3.collectionListboxHeading || 'Items',
                        value: ao3.collectionWorkList || 'No items found'
                    });
                if (test) console.log(`04 - ${JSON.stringify(responseText)}`);
                responseText.setThumbnail(ao3.collectionImage?.startsWith('/') 
                    ? `https://archiveofourown.org${ao3.collectionImage}` 
                    : ao3.collectionImage);
                if (test) console.log(`05 - ${JSON.stringify(responseText)}`);
                responseText.setFooter({ text: `Status: (${ao3.collectionType})` });
                if (test) console.log(`06 - ${JSON.stringify(responseText)}`);
            }
        }
        console.log(`***responseText: ${JSON.stringify(responseText)}`);
        console.log(`***Link type: ${linkType}: ${linkURL} processed at ${formattedDate()}.`);

        // create base message, preserve its options, 
        // then add the silent flag if it is set
        const msgForFeed = { embeds: [responseText] };
        if (silentFlag) msgForFeed.silent = true;

        //send the message, divert or duplicate to the adultFeedChannel
        if (linkType === 'work') {
            const workRating = ao3.workRating ?? '';
            if (processAdultLinks == 1) {
                // Send all posts to feedChannel
                await feedChannel.send(msgForFeed);
            } else if (processAdultLinks == 2) {
                // Send all posts to feedChannel and duplicate adult posts to adultFeedChannel
                await feedChannel.send(msgForFeed);
                if (workRating.includes('Mature') || workRating.includes('Explicit')) {
                    await adultFeedChannel.send(msgForFeed);
                    console.log(`***processAdultLinks: ${processAdultLinks}, rating: ${workRating}, adultFeedChannel: ${adultFeedChannel.name}`);
                }
            } else if (processAdultLinks == 3) {
                //Filter adult works to adultFeedChannel and Send other ratings to feedChannel
                if (workRating.includes('Mature') || workRating.includes('Explicit')) {
                    await adultFeedChannel.send(msgForFeed);
                } else {
                    await feedChannel.send(msgForFeed);
                }
            }
        } else {
            // Send series and collections directly to the feedChannel
            await feedChannel.send(msgForFeed);
        }
    } catch (error) {
        console.log(`*!*!*!Error sending message at ${formattedDate()}: ${error}`);
    }
}