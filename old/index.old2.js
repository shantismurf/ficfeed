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
            break; // Stop the loop if buildEmbed is successful
        } catch (err) {
            const errorWithTimestamp = new Error(`retry error at ${now.toISOString().replace(/\.\d+Z$/, 'Z')} : ${err.message}`);
            console.log(`error ${i}: ${errorWithTimestamp}`);
            if (i === retries - 1) throw errorWithTimestamp; // Throw error on the last retry        
        }
    }
}
// Listen for messages
client.on('messageCreate', message => {
    if (message.author.bot) return; // Ignore messages from bots  
    const urlRegex = /https?:\/\/archiveofourown\.org\/(works|series)\/\d{1,12}|https?:\/\/archiveofourown\.org\/collections\/[^>\]\)"\s]+/g;
    const urlRegexLookbehind = /https?:\/\/archiveofourown\.org\/(works|series)\/\d{1,12}|https?:\/\/archiveofourown\.org\/collections\/[^>\]\)"\s]+/g;
    const linkMatch = message.content.match(urlRegex) || [];
    const msgID = message.id;
    const msgAuthor = message.author.id;
    const msgChannel = message.channel.id;
    if (linkMatch.length > 0) {
        linkMatch.forEach((link) => {
            retry(buildEmbed, link, msgID, msgAuthor, msgChannel, 3, 1000);//retry 3 times with 1 second delay
        });
        //console.log(`2 - Link match: ${linkMatch}, ${msgID}, ${msgAuthor}, ${msgChannel} at ${now.toISOString().replace(/\.\d+Z$/, 'Z')}`);
        //} else {
        //console.log('Link not found at ${now.toISOString().replace(/\.\d+Z$/, 'Z')}');
    }
});
/*
client.on('messageCreate', message => {
    if (message.author.bot) return; // Ignore messages from bots  
    const msgID = message.id;
    const msgAuthor = message.author.id;
    const msgChannel = message.channel.id;
    // fails on urls that dont have characters before them
    const urlRegexLookbehind = /([^a-zA-Z0-9_]{2})\b(https?:\/\/archiveofourown\.org\/(works|series)\/\d{1,12}|https?:\/\/archiveofourown\.org\/collections\/[^>\]\)"\s]+)/g;
    let match;
    let prefix;
    let url;
    while ((match = urlRegexLookbehind.exec(message.content)) !== null) {
        prefix = match[1]; // get the two characters before the URL
        url = match[2]; // get the URL
        if (['/<', '//'].includes(prefix)) {
            console.log(`Skip Prefix Found: ${prefix}`);
        } else {
            console.log(`2 - Link match: ${url}, ${msgID}, ${msgAuthor}, ${msgChannel}`);
            retry(buildEmbed, url, msgID, msgAuthor, msgChannel, 3, 1000);//retry 3 times with 1 second delay
        }
    }
});
*/
async function buildEmbed(linkURL, msgID, msgAuthor, msgChannel) {
    //console.log(`buildEmbed: ${linkURL}, ${msgID}, ${msgAuthor}, ${msgChannel} at ${now.toISOString().replace(/\.\d+Z$/, 'Z')}`);
    let responseText;
    //console.log(`1 - before buildembed try`);
    try {
        //extract data from ao3 html code into json object
        let ao3 = await ao3api(linkURL);
        //check for restricted work error, build embed, and send
        //console.log(`7 - a03api object before feedchannel fetch: ${JSON.stringify(ao3)} for ${linkURL}`);
        const feedChannel = client.channels.cache.get(FEEDID);
        //console.log(`8 - a03api object after feedchannel ${FEEDID}fetch: ${JSON.stringify(ao3)}`);
        if (ao3.error) {
            //responseText = await feedChannel.send({
            responseText = {
                embeds: [{
                    title: `Preview not available. Click here to view.`,
                    url: linkURL,
                    description:
                        `Posted by <@${msgAuthor}> in https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`,
                    color: 0x808080,
                }]
            };
        } else {
            if (ao3.type == 'work') {
                //set limits on summary and tag string lengths and append elipsis if truncated
                let summarystr = (ao3.workSummary ?? 'None').substring(0, 400);
                summarystr = summarystr.length == 400 ? summarystr + ' ...' : summarystr;
                let tagstr = (ao3.workFreeform ?? 'None').substring(0, 400);
                tagstr = tagstr.length == 400 ? tagstr + ' ...' : tagstr;
                //shorten rating text here
                let ratingstr = ao3.workRating === "General Audiences" ? "General" : ao3.workRating === "Teen And Up Audiences" ? "Teen" : ao3.workRating;
                responseText = {
                    embeds: [{
                        title: ao3.workTitle,
                        url: linkURL,
                        description:
                            ` Work posted by <@${msgAuthor}> in https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`,
                        color: ({
                            "Not Rated": 0x808080, "General": 0x0000FF,
                            "Teen": 0x008000, "Mature": 0xFFA500, "Explicit": 0xFF0000
                        })[ratingstr],
                        author: {
                            name: 'A work by ' + ao3.workAuthor,
                            url: `http://archiveofourown.org/users/${ao3.workAuthor}`,
                        },
                        fields: [
                            {
                                name: 'Published' + (ao3.workUpdated ? ' | Updated' : ''),
                                value: (ao3.workPublished + (ao3.workUpdated ? ' | ' + ao3.workUpdated : '')).substring(0, 1024),
                                inline: true
                            },
                            {
                                name: 'Words | Chapters',
                                value: (ao3.workWords + ' | ' + ao3.workChapters).substring(0, 1024),
                                inline: true,
                            },
                            {
                                name: 'Rating | Warning',
                                value: ({
                                    "Not Rated": ':black_circle: ', "General": ':blue_circle: ',
                                    "Teen": ':green_circle: ', "Mature": ':yellow_circle: ', "Explicit": ':red_circle: '
                                })[ratingstr] +
                                    ratingstr + ' | ' + ao3.workWarning.substring(0, 1024),
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
                            text: ('Hits: ' + ao3.workHits + ' | Kudos: ' + (ao3.workKudos ?? 0) +
                                ' | Comments: ' + (ao3.workComments ?? 0)).substring(0, 1024)
                        }
                    }]
                }
                if (ao3.workSeries !== '') {
                    responseText.embeds[0].fields.unshift({
                        name: '',
                        value: ao3.workSeries
                    });
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
                            `:purple_circle: Series posted by <@${msgAuthor}> in https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`,
                        color: 0xD7A9F1,//0xFF00FF,
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
                        author: {
                            name: 'A collection on AO3:',
                        },
                        title: ao3.collectionTitle,
                        url: linkURL,
                        description: `:orange_circle: Collection posted by <@${msgAuthor}> in https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`,
                        color: 0xFF6600,
                        fields: [
                            {
                                name: 'Description:',
                                value: ao3.collectionDescription
                            },
                            {
                                name: 'Bookmarked Items:',
                                value: `(${ao3.collectionBookmarkedItems})`

                            },
                            {
                                name: 'Works:',
                                value: `(${ao3.collectionWorks})`
                            },
                            {
                                name: 'Subcollections:',
                                value: `(${ao3.collectionSubcollections})`
                            },
                            {
                                name: 'Fandoms:',
                                value: `(${ao3.collectionFandoms})`
                            }
                        ],
                        thumbnail: {
                            url: ao3.collectionImage
                        },
                        footer: {
                            text: `Status: (${ao3.collectionType})`
                        }
                    }]
                }
            }
        }
        delete responseText.nonce;
        //console.log(`9 - responseText:${JSON.stringify(responseText)}`);
        responseText = await feedChannel.send(responseText);
        //console.log(`10 - send error: ${error}`);
    } catch (error) {
        console.log(`${now.toISOString().replace(/\.\d+Z$/, 'Z')} : Error fetching AO3 metadata from ${linkURL}\nIn post https://discord.com/channels/${GUILD}/${msgChannel}/${msgID} ):\n${error}`);
    }
}
async function getData(responseText, errorCount, strType, strRegex) {
    let getMatch = strRegex.exec(responseText);
    if (!getMatch) {
        errorCount++;
        console.error(`Failed to match ${strType}, error count: ${errorCount}`);
        getMatch = ['', errorCount];
    } else {
        //console.log(`getData for ${strType}: ${getMatch[1]}`); 
        getMatch = [getMatch[1], errorCount];
    }
    return getMatch;
}
async function ao3api(link) {
    let errorCount = 0;
    let responseText;
    //console.log(`3 - start of ao3api`);
    try {
        let strType = '';
        let strRegex = '';
        let dataArray = [];
        responseText = await fetch(link).then(response => response.text());
        if (!responseText) return { error: true };
        let metadata = {};
        //check if link is for works, series, or collections
        if (link.includes("works")) {
            //console.log(`5 - processing work`);
            metadata.type = 'work';
            //parse the data, creating variable names from each dd class 
            strRegex = /<dd class="([^"]+)">([\s\S]*?)<\/dd>/g;
            let ddMatch;
            while ((ddMatch = strRegex.exec(responseText)) !== null) {
                const className = ddMatch[1];
                const variableName = 'work' + className.split(' ')[0].charAt(0).toUpperCase() + className.split(' ')[0].slice(1);
                const linkRegex = /<a class="tag" href="[^"]*">([^<]+)<\/a>/g;
                const linkMatches = ddMatch[2].match(linkRegex);
                if (linkMatches) {
                    metadata[variableName] = linkMatches.map(match => match.replace(/<a class="tag" href="[^"]*">([^<]+)<\/a>/, '$1')).join(', ');
                } else {
                    metadata[variableName] = ddMatch[2].trim();
                }
            }
            //grab data not easily scraped
            strType = 'title';
            strRegex = /<h2 class="title heading">(.*?)<\/h2>/s;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.workTitle = dataArray[0].trim();
            errorCount = dataArray[1];
            //console.log(`workTitle: ${metadata.workTitle} = ${dataArray[0]}`);
            strType = 'author';
            strRegex = /<a rel="author" href="[^"]+">(.*?)<\/a>/s;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.workAuthor = dataArray[0];
            errorCount = dataArray[1];
            //console.log(`workAuthor: ${metadata.workAuthor} = ${dataArray[1]}`);
            if (!metadata.workAuthor) {
                metadata.workAuthor = '';
            }
            strType = 'published date';
            strRegex = /<dd class="published">(.*?)<\/dd>/;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.workPublished = dataArray[0];
            errorCount = dataArray[1];
            strType = 'series';
            strRegex = /<a href="[\S]">(.*?)<\/a>/;
            metadata.workBookmarks = responseText.match(strRegex);
            strRegex = /<span class="series"><span class="position">(.*?)<a href="(.*?)">(.*?)<\/a><\/span>/;
            const seriesArray = responseText.match(strRegex);
            if (!seriesArray) {
                metadata.workSeries = '';
                errorCount++;
                console.error(`Does not have or failed to match ${strType}, error count: ${errorCount}`);
            } else {
                metadata.workSeries = `${seriesArray[1]}[${seriesArray[3]}](https://archiveofourown.org${seriesArray[2]})`;
            }
            console.log(`workSeries: ${metadata.workSeries}`);
            //retrieve summary and remove/replace html
            strRegex = /<h3 class="heading">Summary:<\/h3>\s*<blockquote class="userstuff">([\s\S]*?)<\/blockquote>/s;
            const summaryMatch = responseText.match(strRegex);
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
                metadata.workSummary = cleanSummary;
            } else {
                metadata.workSummary = '';
                errorCount++;
                console.error(`Failed to match summary, error count: ${errorCount}`);
            }
            console.log(`Work ${link} processed at ${now.toISOString().replace(/\.\d+Z$/, 'Z')} had ${errorCount} error(s).`);
            // if link to series 
        } else if (link.includes("series")) {
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
            //retrieve series metadata
            strType = 'title';
            strRegex = /<h2 class="heading">[\s\n\r]*([^<]+)<\/h2>/;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.seriesTitle = dataArray[0];
            errorCount = dataArray[1];
            strType = 'creator';
            strRegex = /<a rel="author" href=".*?">(.*)<\/a>/;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.seriesCreator = dataArray[0];
            errorCount = dataArray[1];
            strType = 'begun date';
            strRegex = /<dt>Series Begun:<\/dt>\s*<dd>(.*?)<\/dd>/;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.seriesBegun = dataArray[0];
            errorCount = dataArray[1];
            strType = 'updated date';
            strRegex = /<dt>Series Updated:<\/dt>\s*<dd>(.*?)<\/dd>/;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.seriesUpdated = dataArray[0];
            errorCount = dataArray[1];
            strType = 'words';
            strRegex = /<dt class="words">Words:<\/dt>\s*<dd class="words">(.*?)<\/dd>/;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.seriesWords = dataArray[0];
            errorCount = dataArray[1];
            strType = 'works';
            strRegex = /<dt class="works">Works:<\/dt>\s*<dd class="works">(.*?)<\/dd>/;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.seriesWorks = dataArray[0];
            errorCount = dataArray[1];
            strType = 'complete';
            strRegex = /<dt>Complete:<\/dt>\s*<dd>(.*?)<\/dd>/;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.seriesComplete = dataArray[0];
            errorCount = dataArray[1];
            strType = 'bookmarks';
            strRegex = /<dt class="bookmarks">Bookmarks:<\/dt>\s*<dd class="bookmarks"><a href=".*?">(.*?)<\/a><\/dd>/;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.seriesBookmarks = dataArray[0];
            errorCount = dataArray[1];
            //retrieve description and remove/replace html
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
            console.log(`Series ${link} processed at ${now.toISOString().replace(/\.\d+Z$/, 'Z')} had ${errorCount} error(s).`);
            // if link to collections - https://archiveofourown.org/collections/BagginshieldBookClub
        } else if (link.includes("collections")) {
            metadata = {
                type: 'collection',
                collectionTitle: '',
                collectionDescription: '',
                collectionBookmarkedItems: '',
                collectionWorks: '',
                collectionFandoms: '',
                collectionSubcollections: '',
                collectionImage: '',
                collectionType: ''
            };
            //retrieve collection metadata
            strType = 'title';
            strRegex = /<h2 class="heading">[\s\n\r]*([^<]+)<\/h2>/;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.collectionTitle = dataArray[0];
            errorCount = dataArray[1];
            strType = 'bookmarked items';
            strRegex = /bookmarks">Bookmarked Items \((\d+)\)/;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.collectionBookmarkedItems = dataArray[0];
            errorCount = dataArray[1];
            strType = 'works';
            strRegex = /works">Works \((\d+)\)/;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.collectionWorks = dataArray[0];
            errorCount = dataArray[1];
            strType = 'fandoms';
            strRegex = /fandoms">Fandoms \((\d+)\)/;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.collectionFandoms = dataArray[0];
            errorCount = dataArray[1];
            strType = 'subcollections';
            strRegex = /collections">Subcollections \((\d+)\)/;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.collectionSubcollections = dataArray[0];
            errorCount = dataArray[1];
            strType = 'type';
            strRegex = /<p class="type">[\s\S]\((.*?)\)/;;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.collectionType = dataArray[0];
            errorCount = dataArray[1];
            strType = 'image';
            strRegex = /<div class="icon">[\s\S]*<img alt="" src="([^"]+)"/;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.collectionImage = dataArray[0];
            errorCount = dataArray[1];
            //retrieve description and remove/replace html
            const descriptionRegex = /<div class="primary header module">[\s\S]*<blockquote class="userstuff">(.*?)<\/blockquote>/;
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
                    .replace(/<[^>]*>/g, '').trim()
                    .trim();
                metadata.collectionDescription = cleanDescription;
            }
            console.log(`Collection ${link} processed at ${now.toISOString().replace(/\.\d+Z$/, 'Z')} had ${errorCount} error(s).`);
        }
        console.log(`metadata :${JSON.stringify(metadata)}`);
        if (errorCount >= 5) {
            return { error: true };
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