import { Client, Events, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import * as cheerio from 'cheerio';
import axios from 'axios';
import config from './config.json' assert { type: 'json' };
const { TOKEN, GUILD, FEEDID, ADULTFEEDID } = config;
// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
    ],
});
const now = new Date()
// When the client is ready, run this code (only once).
client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});
async function fetchDataWithHeaders(url) {
    const headers = {
        'User-Agent': 'ficfeed: link aggregating Discord bot developed by shantismurf@gmail.com'
    };
    let retryCount = 0;
    const maxRetries = 3;
    while (retryCount < maxRetries) {
        try {
            const response = await axios.get(url, { headers });
            const $ = cheerio.load(response.data);
            return $;
        } catch (error) {
            if (error.response && error.response.headers['retry-after']) {
                const retryAfter = parseInt(error.response.headers['retry-after']);
                console.log(`#${retryCount}: Retrying in ${retryAfter} seconds...\n${error}`);
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            } else {
                console.log(`Retry #${retryCount}\n${error}`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // default to 1 second delay
            }
            retryCount++;
            if (retryCount === maxRetries) {
                console.error("Max retries exceeded: " + error);
                throw error; // rethrow the error so it can be caught by the caller
            }
        }
    }
}
function sanitize(input) {
    input = (!input ? '' : input);
    input = input
        .replace(/&quot;|&#34;/g, '\"')
        .replace(/&amp;|&#38;/g, '&')
        .replace(/&apos;|&#39;/g, '\'')
        .replace(/&nbsp;/g, ' ');
    //Special characters such as asterisks (*), underscores (_), and tildes (~) 
    //that are to be displayed must be escaped with the \ character.
    input = input
        .replace(/[\*]/g, '\\*')
        .replace(/[\_]/g, '\\_')
        .replace(/[\~]/g, '\\~');
    //replace common html tags with markdown
    input = input
        .replace(/<p[^>]*>/gi, '')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<s>/gi, '~~')
        .replace(/<\/s>/gi, '~~')
        .replace(/<i>/gi, '*')
        .replace(/<\/i>/gi, '*')
        .replace(/<b>/gi, '**')
        .replace(/<\/b>/gi, '**')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/gi, '')
        .replace(/\n\n\n/gi, '\n\n'); //remove excess new lines
    return input;
}
// Listen for messages
//const systemMessage = `-# Use '\_ \_' before a link to disable the bot.`;
client.on('messageCreate', async message => {
    if (message.author.bot) return; // Ignore messages from bots  
    const msgID = message.id;
    const msgAuthor = message.author.id;
    const msgChannel = message.channel.id;
    const urlRegex = /https?:\/\/archiveofourown\.org\/(works|series)\/\d{1,12}|https?:\/\/archiveofourown\.org\/collections\/[^>\]\)"\s]+/g;
    const urlRegexLookbehind = /([^a-zA-Z0-9]{4})\b(https?:\/\/archiveofourown\.org\/(works|series)\/\d{1,12}|https?:\/\/archiveofourown\.org\/collections\/[^>\]\)"\s]+)/g;
    let match;
    //make an array of all urls
    while ((match = urlRegex.exec(message.content)) !== null) {
        let url = match[0]; // get one URL from the array
        let linkMatch = urlRegexLookbehind.exec(message.content); //look for any two special characters before it
        //console.log('look behind: ' +(linkMatch ? linkMatch[0] : message.content));
        if (linkMatch) {
            let prefix = linkMatch[1]; // get the two characters before the URL
            if (['_ _ ', ' _ <'].includes(prefix)) { //if they match a skip prefix
                console.log(`Skip Prefix Found: ${prefix}`);
                console.log(`Skip Link match: ${url}`);
            } else { //process the url normally
                console.log(`Link match: ${url}`);
                await buildEmbed(url, msgID, msgAuthor, msgChannel);
            }
        } else { //no characters before url, process normally
            console.log(`Link match: ${url}`);
            await buildEmbed(url, msgID, msgAuthor, msgChannel);
        }
    }
});
async function buildEmbed(linkURL, msgID, msgAuthor, msgChannel) {
    /*
    Embed titles are limited to 256 characters
    Embed descriptions are limited to 4096 characters
    There can be up to 25 fields
    A field's name is limited to 256 characters and its value to 1024 characters
    The footer text is limited to 2048 characters
    The author name is limited to 256 characters
    The sum of all characters from all embed structures in a message must not exceed 6000 characters
    10 embeds can be sent per message
    Special characters such as asterisks (*), underscores (_), and tildes (~) must be escaped with the \ character.
    Tag cannot include the following restricted characters: , ^ * < > { } = ` ， 、 \ %
    75 is the total number of fandom, character, relationship, and additional tags that can be added to a work
    Tags may be up to 100 characters long and can include characters from most languages, numbers, spaces, and some punctuation.
    */
    let responseText;
    try {
        //ao3api extracts data from ao3 html code into json object
        const ao3 = await ao3api(linkURL);
        const feedChannel = client.channels.cache.get(FEEDID);
        const adultFeedChannel = client.channels.cache.get(ADULTFEEDID);
        //set user-defined parameters (someday)
        const processAdultLinks = 2;
        //processAdultLinks: 
        // 1 = post all links to the regular feedChannel, 
        // 2 = post adult links to both the regular channel and the adult channel, 
        // 3 = filter adult links to adult channel only and all others to regular channel        
        const workauthorlength = 230; //max 230 to allow for label text (10) and possible spaces, commas, and elipsis (cannot exceed 256)
        const worksummarylength = 400; //max 1024
        const worktaglength = 400; //max 1024
        const seriesdesclength = 400;
        const worktitlelength = 256; //max 256
        const linkType = (!ao3.type ? 'link' : ao3.type);
        if (ao3.error) {
            //link is restricted or unavailable 
            responseText = new EmbedBuilder()
                .setColor(0x808080)
                //.setTitle(`Preview not available. The ${linkType} may be restricted or unavailable. Click here to view.
                //    \n(${ao3.error?.match(/code\s.*/)?.[0] ?? 'Restricted'})`)
                .setTitle(`Preview not available. The ${linkType} may be restricted or unavailable. Click here to view.
                    \n(${/code\s.*/.exec(ao3.error) ?? 'Restricted'})`)
                .setURL(linkURL)
                .setDescription(`Link posted by <@${msgAuthor}> in https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`)
        } else {
            if (linkType == 'work') {
                //set limits on authors, summary and tag string lengths and append ellipsis if truncated
                let authorstr = (ao3.workAuthor ?? 'None').substring(0, workauthorlength);
                authorstr = authorstr.length == workauthorlength ? authorstr + ' ...' : authorstr;
                let summarystr = (ao3.workSummary ?? 'None').substring(0, worksummarylength);
                summarystr = summarystr.length == worksummarylength ? summarystr + ' ...' : summarystr;
                let tagstr = (ao3.workFreeform ?? 'None').substring(0, worktaglength);
                tagstr = tagstr.length == worktaglength ? tagstr + ' ...' : tagstr;
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
                //build url without psuedonyms
                const authorUrl = authorstr.includes(',') ? null : 'http://archiveofourown.org/users/' + authorstr.replace(/\(.*$/, "").trim();
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
                responseText.addFields(
                    {
                        name: ao3.AdultContentWarning ? ao3.workStatus : 'Published | ' + ao3.workStatus,
                        value: ao3.AdultContentWarning ? ao3.workPublished : ao3.workPublished + ' | ' + ao3.workStatusDate,
                        inline: true
                    });
                responseText.addFields(
                    {
                        name: 'Words | Chapters',
                        value: ao3.workWords + ' | ' + ao3.workChapters,
                        inline: true
                    });
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
                responseText.addFields(
                    {
                        name: 'Fandom',
                        value: sanitize(ao3.workFandom),
                        inline: true
                    });
                responseText.addFields(
                    {
                        name: 'Category',
                        value: ao3.workCategory,
                        inline: true
                    });
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
                responseText.addFields(
                    {
                        name: 'Character',
                        value: (ao3.workCharacters ? sanitize(ao3.workCharacters) : '\t'),
                        inline: true
                    });
                responseText.addFields(
                    {
                        name: 'Tags',
                        value: sanitize((tagstr == null ? '\t' : tagstr))
                    });
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
            } else if (linkType == 'series') {
                //set limits on description string length and append elipsis if truncated
                let descriptionstr = (ao3.seriesDescription ?? 'None').substring(0, seriesdesclength);
                descriptionstr = descriptionstr.length == seriesdesclength ? descriptionstr + ' ...' : descriptionstr;
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
                //build url without psuedonyms
                const authorUrl = ao3.seriesCreator.includes(',') ? null : 'http://archiveofourown.org/users/' + authorstr.replace(/\(.*$/, "").trim();
                responseText.setAuthor({
                    name: 'A series by ' + ao3.seriesCreator,
                    ...(authorUrl && { url: authorUrl }) //only add link to single author
                });
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
                responseText.addFields(
                    {
                        name: 'Works:',
                        value: ao3.seriesWorkList,
                    });
                responseText.setFooter({
                    text: 'Complete: ' + ao3.seriesComplete + ' | Bookmarks: ' + (ao3.seriesBookmarks ?? 0)
                })
            } else if (linkType == 'collection') {
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
                responseText.addFields(
                    {
                        name: '--------------------',
                        value: '-# Restricted works are not included in counts:'
                    });
                responseText.addFields(
                    {
                        name: '\t',
                        value: ao3.collectionWorks + ', ' + ao3.collectionBookmarkedItems
                    });
                responseText.addFields(
                    {
                        name: '\t',
                        value: ao3.collectionSubcollections + ', ' + ao3.collectionFandoms
                    });
                responseText.addFields(
                    {
                        name: ao3.collectionListboxHeading,
                        value: ao3.collectionWorkList
                    });
                responseText.setThumbnail(ao3.collectionImage);
                responseText.setFooter({ text: `Status: (${ao3.collectionType})` });
            }
        }
        console.log(`responseText: ${JSON.stringify(responseText)}`);
        console.log(`Link type: ${ao3.type}: ${linkURL} processed at ${now.toISOString().replace(/\.\d+Z$/, 'Z')}.`);

        //send the message, divert or duplicate to the adultFeedChannel
        if (linkType === 'work') {
            console.log(`processAdultLinks: ${processAdultLinks}, rating: ${ao3.workRating}, feedChannel: ${feedChannel.name}, adultFeedChannel: ${adultFeedChannel.name}`);
            if (processAdultLinks == 1) {
                // Send all posts to feedChannel
                await feedChannel.send({ embeds: [responseText] });
            } else if (processAdultLinks == 2) {
                // Send all posts to feedChannel and duplicate adult posts to adultFeedChannel
                await feedChannel.send({ embeds: [responseText] });
                if (ao3.workRating.includes('Mature') || ao3.workRating.includes('Explicit')) {
                    await adultFeedChannel.send({ embeds: [responseText] });
                }
            } else if (processAdultLinks == 3) {
                //Filter adult works to adultFeedChannel and Send other ratings to feedChannel
                if (ao3.workRating.includes('Mature') || ao3.workRating.includes('Explicit')) {
                    await adultFeedChannel.send({ embeds: [responseText] });
                } else {
                    await feedChannel.send({ embeds: [responseText] });
                }
            }
        } else {
            // Send series and collections directly to the feedChannel
            await feedChannel.send({ embeds: [responseText] });
        }
    } catch (error) {
        console.log(`${now.toISOString().replace(/\.\d+Z$/, 'Z')}: Error sending message: ${error}`);
    }
}
async function ao3api(link) {
    let responseText;
    try {
        const $ = await fetchDataWithHeaders(link);
        let metadata = {};
        //check if link is for works, series, or collections
        if (link.includes("works")) {
            metadata.type = 'work';
            if ($('h2.landmark.heading').text().trim() == 'Adult Content Warning') {
                //M and E fics have a different layout when not logged in
                metadata.AdultContentWarning = true;
                const authors = $('h4.heading a').map((_, a) => $(a).text()).get();
                metadata.workTitle = authors[0];
                metadata.workAuthor = authors.slice(1).join(', ');
                metadata.workRating = $('span.rating').text().trim();
                metadata.workWarning = $('span.warnings').text().trim();
                metadata.workCategory = $('span.category').text().trim();
                const relationships = $('li.relationships a').map((_, a) => $(a).text()).get();
                metadata.workRelationship = relationships.join(relationships.length > 1 ? ', ' : '');
                const characters = $('li.characters a').map((_, a) => $(a).text()).get();
                metadata.workCharacters = characters.join(characters.length > 1 ? ', ' : '');
                const freeforms = $('li.freeforms a').map((_, a) => $(a).text()).get();
                metadata.workFreeform = freeforms.join(freeforms.length > 1 ? ', ' : '');
                const fandoms = $('h5.fandoms.heading a').map((_, a) => $(a).text()).get();
                metadata.workFandom = fandoms.join(fandoms.length > 1 ? ', ' : '');
                metadata.workLanguage = $('dd.language').text().trim();
                let dateObj = new Date($('p.datetime').text());
                metadata.workPublished = dateObj.toISOString().split('T')[0];
                metadata.workChapters = $('dd.chapters').text();
                metadata.workStatus = metadata.workChapters == '1/1' ? 'Completed' : $('dt.status')?.text()?.slice(0, -1);
                metadata.workStatusDate = $('dd.status').text() ? $('dd.status').text() : metadata.workPublished;
                metadata.workBookmarks = $('dd.bookmarks a').text();
                metadata.workWords = $('dd.words').text();
                metadata.workComments = $('dd.comments').text();
                metadata.workKudos = $('dd.kudos').text();
                metadata.workHits = $('dd.hits').text();
                const seriesText = $('ul.series li').text().trim();
                if (seriesText) {
                    const linkText = seriesText.substring(seriesText.indexOf('of') + 3);
                    const linkUrl = $('ul.series li a').attr('href');
                    metadata.workSeries = seriesText.replace(/of (.*)/, `of [${linkText}](https://archiveofourown.org${linkUrl})`);
                }
                metadata.workSummary = $('blockquote.userstuff.summary').html().trim();
            } else {
                metadata.workTitle = $('h2.title.heading').text().trim();
                const authors = $('h3.byline.heading a').map((_, a) => $(a).text()).get();
                metadata.workAuthor = authors.join(authors.length > 1 ? ', ' : '');
                metadata.workRating = $('dd.rating ul li a').text().trim();
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
                metadata.workStatus = metadata.workChapters == '1/1' ? 'Completed' : $('dt.status')?.text()?.slice(0, -1);
                metadata.workStatusDate = $('dd.status').text() ? $('dd.status').text() : metadata.workPublished;
                metadata.workBookmarks = $('dd.bookmarks a').text();
                metadata.workWords = $('dd.words').text();
                metadata.workComments = $('dd.comments').text();
                metadata.workKudos = $('dd.kudos').text();
                metadata.workHits = $('dd.hits').text();
                const seriesText = $('dd.series span.position').text().trim();
                if (seriesText) {
                    const linkText = seriesText.substring(seriesText.indexOf('of') + 3);
                    const linkUrl = $('dd.series span.position a').attr('href');
                    metadata.workSeries = seriesText.replace(/of (.*)/, `of [${linkText}](https://archiveofourown.org${linkUrl})`);
                }
                metadata.workSummary = $('.summary blockquote').html().trim();
            }
            // if title is not found then trigger the unavailable embed
            if (metadata.workTitle == '') {
                console.log('Work title not found.');
                return { metadata, error: true }
            };
        } else if (link.includes("series")) {
            metadata.type = 'series';
            metadata.seriesTitle = $('h2.heading').text();
            // if title is not found then trigger the unavailable embed 
            if (metadata.seriesTitle == '') {
                console.log('Series title not found.');
                return { metadata, error: true }
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
            tag.find('li').slice(0, 65).each((index, li) => {
                const h4 = $(li).find('h4.heading');
                const links = Array.from(h4.find('a'));
                const itemTitle = $(links[0]).text();
                const itemAuthor = links.length > 1 ? 'multiple authors' : $(links[1]).text();
                if (itemTitle.length > 0) {
                    const itemRating = $(li).find('span.rating');
                    seriesWorkList = seriesWorkList.concat('- [' +
                        itemTitle + '](https://archiveofourown.org/' +
                        $(links[0]).attr('href') + ') by ' +
                        itemAuthor + ' (' +
                        itemRating.attr('title').substring(0, 1) + ')\n');
                }
            });
            metadata.seriesWorkList = seriesWorkList;

        } else if (link.includes("collections")) {
            metadata.type = 'collection';
            metadata.collectionTitle = $('h2.heading').text();
            // if title is not found then trigger the unavailable embed 
            if (metadata.collectionTitle == '') {
                console.log('Collection title not found.');
                return { metadata, error: true }
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
            metadata.collectionType = $('p.type').text().match(/\((.*)\)/)[1].trim();
            metadata.collectionImage = $('div.icon').find('img').attr('src');
            metadata.collectionDescription = $('div.primary.header.module').find('blockquote.userstuff').html().trim();
        }
        console.log(`Metadata: ${JSON.stringify(metadata)}`);
        return metadata;
    } catch (e) {
        console.log(`Link ${link} failed to be processed at ${now.toISOString().replace(/\.\d+Z$/, 'Z')}.`);
        console.log(e)
        return { error: e, type: metadata.type } // Pass the type attribute along with the error
    }
}
// Log in to Discord with your client's token
client.login(TOKEN);