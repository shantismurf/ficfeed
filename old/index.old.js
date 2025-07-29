// Require the necessary discord.js classes
const { Client, Events, GatewayIntentBits } = require('discord.js');
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
const { TOKEN, GUILD, FEEDID } = require('./config.json');
const now = new Date()
// When the client is ready, run this code (only once).
client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});
//call the buildEmbed function with a retry loop to catch any weird discord.js "nonce" errors and try again
async function retry(buildEmbed, link, msgID, msgAuthor, msgChannel, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            await buildEmbed(link, msgID, msgAuthor, msgChannel);
        } catch (err) {
            const errorWithTimestamp = new Error(`${now.toISOString().replace(/\.\d+Z$/, 'Z')} : ${err.message}`);
            if (i === retries - 1) throw errorWithTimestamp; // Throw error on the last retry        
        }
    }
}
// Listen for messages
client.on('messageCreate', message => {
    if (message.author.bot) return; // Ignore messages from bots  
    //const linkMatch = message.content.match(/archiveofourown.org\/works\/\d{1,12}/g) ?? []; //match only 'works' links
    //const linkMatch = message.content.match(/archiveofourown.org\/(works|series)\/\d{1,12}/g) ?? []; //match 'works' and 'series' links
    //const linkMatch = message.content.match(/(https?:\/\/archiveofourown\.org\/(works|series)\/\d{1,12}|https?:\/\/archiveofourown\.org\/collections\/[^\/]+)/g) ?? [];
    const urlRegex = /https?:\/\/archiveofourown\.org\/(works|series)\/\d{1,12}|https?:\/\/archiveofourown\.org\/collections\/[^ ]+/g;
    const linkMatch = message.content.match(urlRegex) || [];
    const msgID = message.id;
    const msgAuthor = message.author.id;
    const msgChannel = message.channel.id;
    if (linkMatch.length > 0) {
        linkMatch.forEach((link) => {
            buildEmbed(link, msgID, msgAuthor, msgChannel);
            //retry(buildEmbed, link, msgID, msgAuthor, msgChannel, 3, 1000);
                //.then(data => console.log(data))
                //.catch(err => console.error(err));
        });
        console.log(`Link match: ${linkMatch}, ${msgID}, ${msgAuthor}, ${msgChannel} at ${now.toISOString().replace(/\.\d+Z$/, 'Z')}`);
        //} else {
        //console.log('Link not found at ${now.toISOString().replace(/\.\d+Z$/, 'Z')}');
    }
});

async function buildEmbed(linkURL, msgID, msgAuthor, msgChannel) {
    console.log(`buildEmbed: ${linkURL}, ${msgID}, ${msgAuthor}, ${msgChannel} at ${now.toISOString().replace(/\.\d+Z$/, 'Z')}`);
    try {
        //extract data from ao3 html code into json object
        let ao3 = await ao3api(linkURL);
        //check for restricted work error, build embed, and send
        let responseText = null;
        const feedChannel = client.channels.cache.get(FEEDID);
        if (ao3.error) {
            responseText = await feedChannel.send({
                embeds: [{
                    title: `Preview not available. Click here to see ${ao3.type}.`,
                    url: linkURL,
                    description:
                        `Posted by <@${msgAuthor}> in https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`,
                    color: 0x0000FF,
                }]
            });
        } else {
            if (ao3.type == 'work') {
                //set limits on summary and tag string lengths and append elipsis if truncated
                let summarystr = (ao3.summary ?? 'None').substring(0, 400);
                summarystr = summarystr.length == 400 ? summarystr + ' ...' : summarystr;
                let tagstr = (ao3.freeform ?? 'None').substring(0, 400);
                tagstr = tagstr.length == 400 ? tagstr + ' ...' : tagstr;
                //shorten rating text here
                let ratingstr = ao3.rating === "General Audiences" ? "General" : ao3.rating === "Teen And Up Audiences" ? "Teen" : ao3.rating;
                responseText = {
                    embeds: [{
                        title: ao3.title,
                        url: linkURL,
                        description:
                            `Posted by <@${msgAuthor}> in https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`,
                        color: ({
                            "Not Rated": 0x808080, "General": 0x0000FF,
                            "Teen": 0x008000, "Mature": 0xFFA500, "Explicit": 0xFF0000
                        })[ratingstr],
                        author: {
                            name: 'A work by ' + ao3.author,
                            url: ao3.authorlink,
                        },
                        fields: [
                            {
                                name: 'Published' + (ao3.status ? ' | Updated' : ''),
                                value: (ao3.published + (ao3.status ? ' | ' + ao3.status : '')).substring(0, 1024),
                                inline: true
                            },
                            {
                                name: 'Words | Chapters',
                                value: (ao3.words + ' | ' + ao3.chapters).substring(0, 1024),
                                inline: true,
                            },
                            {
                                name: 'Rating | Warning',
                                value: (ratingstr + ' | ' + ao3.warning).substring(0, 1024),
                            },
                            {
                                name: 'Tags',
                                value: tagstr,
                                inline: true,
                            },
                            {
                                name: 'Summary',
                                value: summarystr,
                            },
                        ],
                        footer: {
                            text: ('Hits: ' + ao3.hits + ' | Kudos: ' + (ao3.kudos ?? 0) +
                                ' | Comments: ' + (ao3.comments ?? 0)).substring(0, 1024)
                        }
                    }]
                }
            } else if (ao3.type == 'series') {
                //set limits on description string length and append elipsis if truncated
                let descriptionstr = (ao3.seriesDescription ?? 'None').substring(0, 400);
                descriptionstr = descriptionstr.length == 400 ? descriptionstr + ' ...' : descriptionstr;
                responseText = {
                    embeds: [{
                        title: ao3.seriesTitle,
                        url: linkURL,
                        description:
                            `Posted by <@${msgAuthor}> in https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`,
                        color: 0xFF00FF,
                        author: {
                            name: 'A series by ' + ao3.seriesCreator,
                            url: 'https://archiveofourown.org/users/' + ao3.seriesCreator,
                        },
                        fields: [
                            {
                                name: 'Date Begun | Date Updated',  //seriesBegun/seriesUpdated
                                value: (ao3.seriesBegun + ' | ' + ao3.seriesUpdated).substring(0, 1024),
                                inline: true
                            },
                            {
                                name: 'Description',
                                value: descriptionstr,
                            },
                            {
                                name: 'Words | Works',
                                value: (ao3.seriesWords + ' words in ' + ao3.seriesWorks).substring(0, 1024) + (ao3.seriesWorks > 1 ? ' works' : ' work'),
                                inline: true,
                            }
                        ],
                        footer: {
                            text: 'Complete: ' + ao3.seriesComplete + ' | Bookmarks: ' + (ao3.bookmarks ?? 0)
                        }
                    }]
                }
            } else if (ao3.type == 'collection') {
                responseText = {
                    embeds: [{
                        title: `Preview not available. Click here to see ${ao3.type}.`,
                        url: linkURL,
                        description:
                            `Posted by <@${msgAuthor}> in https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`,
                        color: 0xFF6600,
                    }]
                }
            }
        }
        console.log(`${now.toISOString().replace(/\.\d+Z$/, 'Z')} :${JSON.stringify(responseText)}`);
        responseText = await feedChannel.send(responseText);
    } catch (error) {
        console.error(`${now.toISOString().replace(/\.\d+Z$/, 'Z')} : Error fetching AO3 metadata from ${linkURL}\nIn post https://discord.com/channels/${GUILD}/${msgChannel}/${msgID} ):\n${error}`);
    }
}
async function ao3api(link) {
    let errorCount = 0;
    try {
        let responseText = await fetch(link).then(response => response.text());
        if (!responseText) return { error: true };
        let metadata = {};
        //check if link is for works, series, or collections
        if (link.includes("works")) {
            metadata = { type: 'work' }
            let currentMatch;
            let ddPattern = /<dd class="(.*?)(?<!stats)( tags)?">(.*?)<\/dd>/gs;
            while (currentMatch = ddPattern.exec(responseText)) {
                let tagPattern = /(?<=<a class="tag" href=".*?">).*?(?=<\/a>)/gs;
                let matchedTags = [];
                let currentTag = '';
                let i = 0;
                while ((currentTag = tagPattern.exec(currentMatch[3])) && i++ < 100)
                    matchedTags.push(currentTag);
                if (matchedTags.length == 0)
                    matchedTags = [currentMatch[3]];
                metadata[currentMatch[1]] = matchedTags.join(', ').replaceAll('&#39;', "'");
            };
            const titleMatch = responseText.match(/<h2 class="title heading">(.*?)<\/h2>/s);
            if (titleMatch) {
                metadata.title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
            } else {
                console.error('Failed to match title');
                metadata.title = '';
                errorCount++;
            }
            const authorMatch = responseText.match(/(?<=<a rel="author" href=".*?">).*?(?=<\/a>)/s);
            if (authorMatch) {
                metadata.author = authorMatch[0];
            } else {
                console.error('Failed to match author');
                metadata.author = '';
                errorCount++;
            }
            const authorLinkMatch = responseText.match(/(?<=<a rel="author" href=").*?(?=">)/s);
            if (authorLinkMatch) {
                metadata.authorlink = 'https://archiveofourown.org' + authorLinkMatch[0];
            } else {
                console.error('Failed to match author link');
                metadata.authorlink = '';
                errorCount++;
            }
            const summaryMatch = responseText.match(/<h3 class="heading">Summary:<\/h3>\s*<blockquote class="userstuff">([\s\S]*?)<\/blockquote>/s);
            if (summaryMatch) {
                const cleanSummary = summaryMatch[0]
                    .replace(/<(p|i|b)>/gs, (m, tag) => {
                        switch (tag) {
                            case 'p':
                                return '\n' + m + '\n';
                            case 'i':
                                return '*$&*';
                            case 'b':
                                return '**$&**';
                            default:
                                return '';
                        }
                    })
                    .replace(/<\/(p|i|b)>/gs, '')
                    .replace(/<br\s*\/?>/gs, '\n')
                    .replace(/Summary:/gs, '')
                    .replace(/<[^>]*>/g, '').trim()
                    .trim();
                metadata.summary = cleanSummary;
            } else {
                console.error('Failed to match summary');
                metadata.summary = '';
                errorCount++;
            }
            const publishedMatch = responseText.match(/<dd class="published">.*?<\/dd>/);
            if (publishedMatch) {
                metadata.published = publishedMatch[0].replace(/<dd class="published">|<\/dd>/g, '');
            } else {
                console.error('Failed to match published date');
                metadata.publishedDate = '';
                errorCount++;
            }
            const updatedDateMatch = responseText.match(/<dd class="status">(.*?)<\/dd>/);
            if (updatedDateMatch) {
                metadata.updatedDate = updatedDateMatch[1];
            } else {
                console.error('Failed to match updated date');
                metadata.updatedDate = '';
                errorCount++;
            }
            if (errorCount > 5) {
                return { error: true };
            }
            console.log(`Work link processed at ${now.toISOString().replace(/\.\d+Z$/, 'Z')} had ${errorCount} error(s).`);
            // if link to series - https://archiveofourown.org/series/4259356
        } else if (link.includes("series")) {
//           let responseText = await fetch(link).then(response => response.text());
//           if (!responseText) return { error: true };
            metadata = {
                type: 'series',
                seriesTitle: '',
                seriesCreator: '',
                seriesBegun: '',
                seriesUpdated: '',
                seriesDescription: '',
                seriesWords: '',
                seriesWorks: '',
                seriesComplete: '',
                seriesBookmarks: ''
            };
            /* html input:
            <h2 class="heading">
                Bagginshield - Flash Fiction Fridays
            </h2>
            */
            const titleRegex = /<h2 class="heading">[\s\n\r]*([^<]+)<\/h2>/;
            const titleMatch = responseText.match(titleRegex);//titleRegex.exec(responseText);
            if (!titleMatch) {
                console.error('Failed to match title');
                errorCount++;
            } else {
                metadata.seriesTitle = titleMatch[1];
            }
            const creatorRegex = /<a rel="author" href=".*?">(.*)<\/a>/;
            const creatorMatch = creatorRegex.exec(responseText);
            if (!creatorMatch) {
                console.error('Failed to match creator');
                errorCount++;
            } else {
                metadata.seriesCreator = creatorMatch[1];
            }
            const begunRegex = /<dt>Series Begun:<\/dt>\s*<dd>(.*?)<\/dd>/;
            const begunMatch = begunRegex.exec(responseText);
            if (!begunMatch) {
                console.error('Failed to match begun date');
                errorCount++;
            } else {
                metadata.seriesBegun = begunMatch[1];
            }
            const updatedRegex = /<dt>Series Updated:<\/dt>\s*<dd>(.*?)<\/dd>/;
            const updatedMatch = updatedRegex.exec(responseText);
            if (!updatedMatch) {
                console.error('Failed to match updated date');
                errorCount++;
            } else {
                metadata.seriesUpdated = updatedMatch[1];
            }
            const descriptionRegex = /<dt>Description:<\/dt>\s*<dd><blockquote class="userstuff">(.*?)<\/blockquote><\/dd>/;
            const descriptionMatch = descriptionRegex.exec(responseText);
            if (!descriptionMatch) {
                console.error('Failed to match description');
                errorCount++;
            } else {
                const cleanDescription = descriptionMatch[1]
                    .replace(/<(p|i|b)>/gs, (m, tag) => {
                        switch (tag) {
                            case 'p':
                                return '\n' + m + '\n';
                            case 'i':
                                return '*$&*';
                            case 'b':
                                return '**$&**';
                            default:
                                return '';
                        }
                    })
                    .replace(/<\/(p|i|b)>/gs, '')
                    .replace(/<br\s*\/?>/gs, '\n')
                    .replace(/Summary:/gs, '')
                    .replace(/<[^>]*>/g, '').trim()
                    .trim();
                metadata.seriesDescription = cleanDescription;
            }
            const wordsRegex = /<dt class="words">Words:<\/dt>\s*<dd class="words">(.*?)<\/dd>/;
            const wordsMatch = wordsRegex.exec(responseText);
            if (!wordsMatch) {
                console.error('Failed to match words');
                errorCount++;
            } else {
                metadata.seriesWords = wordsMatch[1];
            }
            const worksRegex = /<dt class="works">Works:<\/dt>\s*<dd class="works">(.*?)<\/dd>/;
            const worksMatch = worksRegex.exec(responseText);
            if (!worksMatch) {
                console.error('Failed to match works');
                errorCount++;
            } else {
                metadata.seriesWorks = worksMatch[1];
            }
            const completeRegex = /<dt>Complete:<\/dt>\s*<dd>(.*?)<\/dd>/;
            const completeMatch = completeRegex.exec(responseText);
            if (!completeMatch) {
                console.error('Failed to match complete');
                errorCount++;
            } else {
                metadata.seriesComplete = completeMatch[1];
            }
            const bookmarksRegex = /<dt class="bookmarks">Bookmarks:<\/dt>\s*<dd class="bookmarks"><a href=".*?">(.*?)<\/a><\/dd>/;
            const bookmarksMatch = bookmarksRegex.exec(responseText);
            if (!bookmarksMatch) {
                console.error('Failed to match bookmarks');
                errorCount++;
            } else {
                metadata.seriesBookmarks = bookmarksMatch[1];
            }
            //console.log(metadata);
            console.log(`Series link processed at ${now.toISOString().replace(/\.\d+Z$/, 'Z')} had ${errorCount} error(s).`);
            // if link to collections - https://archiveofourown.org/collections/BagginshieldBookClub
        } else if (link.includes("collections")) {
            metadata = { type: 'collection' }
            console.log(`Collection link processed at ${now.toISOString().replace(/\.\d+Z$/, 'Z')} had ${errorCount} error(s).`);
        }
        return metadata;
    } catch (e) {
        console.log(`Link ${link} processed at ${now.toISOString().replace(/\.\d+Z$/, 'Z')} failed.`);
        console.error(e)
        return { error: e }
    }
}
// Log in to Discord with your client's token
client.login(TOKEN);