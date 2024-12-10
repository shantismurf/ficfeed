// Require the necessary discord.js classes
const { Client, Events, GatewayIntentBits, EmbedBuilder } = require('discord.js');
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
//const systemMessage = `-# Use '//' before a link to disable the bot.`;
//call the buildEmbed function with a retry loop to catch any weird errors and try again
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
                console.log(`1 - Link match: ${url}`);
                retry(buildEmbed, url, msgID, msgAuthor, msgChannel, 3, 1000);//retry 3 times with 1 second delay
            }
        } else { //no characters before url, process normally
            console.log(`1 - Link match: ${url}`);
            retry(buildEmbed, url, msgID, msgAuthor, msgChannel, 3, 1000);//retry 3 times with 1 second delay
        }
    }
});
let linkType;
async function buildEmbed(linkURL, msgID, msgAuthor, msgChannel) {
    let responseText;
    try {
        //extract data from ao3 html code into json object
        let ao3 = await ao3api(linkURL);
        //check for restricted work error, build embed, and send
        const feedChannel = client.channels.cache.get(FEEDID);
        if (ao3.error) {
            //work is restricted or unavailable 
            linkType = linkType.split(' ')[0].charAt(0).toUpperCase() + linkType.split(' ')[0].slice(1);
            responseText = new EmbedBuilder()
                .setColor(0x808080)
                .setTitle(`Preview not available. ${linkType} may be restricted or unavailable. Click here to view.`)
                .setURL(linkURL)
                .setDescription(`Posted by <@${msgAuthor}> in https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`)
        } else {
            if (ao3.type == 'work') {
                //set limits on summary and tag string lengths and append elipsis if truncated
                let summarystr = (ao3.workSummary ?? 'None').substring(0, 400);
                summarystr = summarystr.length == 400 ? summarystr + ' ...' : summarystr;
                let tagstr = (ao3.workFreeform ?? 'None').substring(0, 400);
                tagstr = tagstr.length == 400 ? tagstr + ' ...' : tagstr;
                let ratingstr = //shorten rating text
                    ao3.workRating === "General Audiences" ? "General" :
                        ao3.workRating === "Teen And Up Audiences" ? "Teen" :
                            ao3.workRating;
                let workAuthor = ao3.workAuthor.replace(/\(.*$/, "").trim();
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
                    .setTitle(ao3.workTitle.substring(0, 1024))
                    .setURL(linkURL)
                    .setAuthor({
                        name: 'A work by ' + ao3.workAuthor, //display full author name
                        url: `http://archiveofourown.org/users/${workAuthor}` //only link main name
                    })
                    .setDescription(
                        ` Work posted by <@${msgAuthor}> in ` +
                        `https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`
                    );
                if (ao3.workSeries !== '') { //add series text first, if it exists
                    responseText.addFields({
                        name: '\t',
                        value: ao3.workSeries//.substring(0, 1024)
                    });
                }
                if (ao3.workPublished) {
                    let strName = 'Published';
                    let strValue = ao3.workPublished.substring(0, 1024);
                    if (ao3.workComplete) { //if the work is complete
                        strName = 'Published | Completed';
                        if (ao3.workUpdated) { //and has an updated date use that
                            strValue = strValue + ' | ' + ao3.workUpdated.substring(0, 1024);
                        } else { //if its complete but has no updated date use published date (chapters are 1/1)
                            strValue = strValue + ' | ' + strValue;
                        };
                    } else { //if workcomplete is false only print published date, unless an updated date exists
                        let strUpdated = ao3.workUpdated ? ao3.workUpdated.substring(0, 1024) : '';
                        strName = 'Published' + (strUpdated.length > 0 ? ' | Updated' : '');
                        strValue = strValue + (strUpdated.length > 0 ? ' | ' + strUpdated : '');
                    };
                    responseText.addFields({ name: strName, value: strValue, inline: true });
                };
                responseText.addFields(
                    {
                        name: 'Words | Chapters',
                        value: (ao3.workWords + ' | ' + ao3.workChapters).substring(0, 1024),
                        inline: true
                    },
                    {//compare text to ratingstr and set the appropriate icon
                        name: 'Rating | Warning',
                        value: ({
                            "Not Rated": ':black_circle: ',
                            "General": ':blue_circle: ',
                            "Teen": ':green_circle: ',
                            "Mature": ':yellow_circle: ',
                            "Explicit": ':red_circle: '
                        })[ratingstr] +
                            ratingstr + ' | ' + ao3.workWarning.substring(0, 1024)
                    },
                    {
                        name: 'Fandom',
                        value: ao3.workFandom.substring(0, 1024),
                        inline: true
                    },
                    {
                        name: 'Category',
                        value: ao3.workCategory.substring(0, 1024),
                        inline: true
                    },
                    //blank field to make two column line break
                    {
                        name: '\t',
                        value: '\t'
                    },
                    {
                        name: 'Relationship',
                        value: ao3.workRelationship,
                        inline: true
                    },
                    {
                        name: 'Character',
                        value: ao3.workCharacter,
                        inline: true
                    },
                    {
                        name: 'Tags',
                        value: tagstr
                    },
                    {
                        name: 'Summary',
                        value: summarystr
                    }
                )
                    .setFooter({
                        text: 'Kudos: ' + (ao3.workKudos ?? 0) + 
                            ' | Comments: ' + (ao3.workComments ?? 0) + 
                            ' | Bookmarks: ' + (ao3.workBookmarks ?? 0) +
                            ' | Hits: ' + (ao3.workHits ?? 0) 	
                    });
            } else if (ao3.type == 'series') {
                //set limits on description string length and append elipsis if truncated
                let descriptionstr = (ao3.seriesDescription ?? 'None').substring(0, 400);
                descriptionstr = descriptionstr.length == 400 ? descriptionstr + ' ...' : descriptionstr;
                let seriesCreator = ao3.seriesCreator.replace(/\(.*$/, "").trim();
                responseText = new EmbedBuilder()
                    .setColor(0xD7A9F1)
                    .setTitle(ao3.seriesTitle)
                    .setURL(linkURL)
                    .setDescription(
                        `:purple_circle: Series posted by <@${msgAuthor}> ` +
                        `in https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`
                    )
                    .setAuthor({
                        name: 'A series by ' + ao3.seriesCreator, //display full name
                        url: 'https://archiveofourown.org/users/' + seriesCreator //only link the main name
                    })
                    .addFields(
                        {
                            name: 'Date Begun | Date Updated',
                            value: ao3.seriesBegun + ' | ' + ao3.seriesUpdated
                        },
                        {
                            name: 'Description',
                            value: (descriptionstr == '' ? '\t' : descriptionstr)
                        },
                        {
                            name: 'Words | Works',
                            value: `${ao3.seriesWords} words in ${ao3.seriesWorks}` + (ao3.seriesWorks > 1 ? ' works' : ' work')
                        }
                    )
                    .setFooter({
                        text: 'Complete: ' + ao3.seriesComplete + ' | Bookmarks: ' + (ao3.bookmarks ?? 0)
                    })
            } else if (ao3.type == 'collection') {
                responseText = new EmbedBuilder();
                responseText.setColor(0xFF6600);
                responseText.setTitle(ao3.collectionTitle);
                responseText.setURL(linkURL);
                responseText.setDescription(`:orange_circle: Collection posted by <@${msgAuthor}> in https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`);
                responseText.addFields(
                    {
                        name: 'Description:',
                        value: (ao3.collectionDescription ? ao3.collectionDescription :'\t')
                    });
                responseText.addFields(
                    {
                        name: 'Bookmarked Items:',
                        value: `(${ao3.collectionBookmarkedItems})`
                    });
                responseText.addFields(
                    {
                        name: 'Works:',
                        value: `(${ao3.collectionWorks})`
                    });
                responseText.addFields(
                    {
                        name: 'Subcollections:',
                        value: `(${ao3.collectionSubcollections})`
                    });
                responseText.addFields(
                    {
                        name: 'Fandoms:',
                        value: `(${ao3.collectionFandoms})`
                    });
                responseText.setThumbnail(ao3.collectionImage);
                responseText.setFooter({ text: `Status: (${ao3.collectionType})` });
            }
        }
        console.log(`responseText: ${JSON.stringify(responseText)}`);
        //send the message
        responseText = await feedChannel.send({ embeds: [responseText] });
    } catch (error) {
        console.log(`${now.toISOString().replace(/\.\d+Z$/, 'Z')}: Error sending message: ${error}`);
    }
}
async function getData(responseText, errorCount, strType, strRegex) {
    let getMatch = strRegex.exec(responseText);
    if (!getMatch) {
        errorCount++;
        console.log(`Failed to match ${strType}, error count: ${errorCount}`);
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
            linkType = 'work';
            metadata.type = linkType;
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
            strType = 'author';
            strRegex = /<a rel="author" href="[^"]+">(.*?)<\/a>/s;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.workAuthor = dataArray[0];
            errorCount = dataArray[1];
            metadata.workAuthor = (!metadata.workAuthor ? '' : metadata.workAuthor);
            strType = 'published date';
            strRegex = /<dd class="published">(.*?)<\/dd>/;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.workPublished = dataArray[0];
            errorCount = dataArray[1];
            strType = 'bookmarks';
            strRegex = /\/bookmarks">(\d+)<\/a>/;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.workBookmarks = dataArray[0];
            errorCount = dataArray[1];
            strType = 'completed';
            let workComplete = (responseText.match(/<dt class=\"status\">Completed:<\/dt>/) ? true : false);
            metadata.workComplete = (metadata.workChapters == '1/1' ? true : workComplete);
            strType = 'series';
            strRegex = /<span class="series">\n\s+<span class="position">\n\s+(.*?)<a href="(.*?)">(.*?)<\/a>\n\s+<\/span>/;
            const seriesArray = responseText.match(strRegex);
            if (!seriesArray) {
                metadata.workSeries = '';
                errorCount++;
                console.log(`Does not have or failed to match ${strType}, error count: ${errorCount}`);
            } else { ///build series link with text # of #
                metadata.workSeries = `${seriesArray[1]}[${seriesArray[3]}](https://archiveofourown.org${seriesArray[2]})`;
            }
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
                console.log(`Failed to match summary, error count: ${errorCount}`);
            }
            console.log(`Work ${link} processed at ${now.toISOString().replace(/\.\d+Z$/, 'Z')} had ${errorCount} error(s).`);
            // if link to series 
        } else if (link.includes("series")) {
            linkType = 'series';
            metadata.type = linkType;
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
                console.log('Failed to match description');
                metadata.seriesDescription = '';
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
            linkType = 'collection';
            metadata.type = linkType;
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
            strRegex = /<p class="type">\s{1,}\((.*?)\)/;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.collectionType = dataArray[0];
            errorCount = dataArray[1];
            strType = 'image';
            strRegex = /<div class="icon">[\s\S]*<img alt="" src="([^"]+)"/;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.collectionImage = (dataArray[0].indexOf('http') === -1 ? `https://archiveofourown.org${dataArray[0]}` : dataArray[0]);
            errorCount = dataArray[1];
            //retrieve description and remove/replace html
            const descriptionRegex = /<div class="primary header module">[\s\S]*<blockquote class="userstuff">(.*?)<\/blockquote>/;
            const descriptionMatch = descriptionRegex.exec(responseText);
            if (!descriptionMatch) {
                console.log('Failed to match description');
                metadata.collectionDescription = '';
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
        console.log(e)
        return { error: e }
    }
}
//status update experiment 
client.on('presenceUpdate', (oldPresence, newPresence) => {
  //  if (!newPresence.activities) return false; 
   // newPresence.activities.forEach(activity => {
    console.log(`${now.toISOString().replace(/\.\d+Z$/, 'Z')}: ${newPresence.member} is now ${newPresence.status}`);

});
// Log in to Discord with your client's token
client.login(TOKEN);
