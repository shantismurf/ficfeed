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
//const systemMessage = `-# Use '\_ \_' before a link to disable the bot.`;
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
function sanitize (input) {
    input = (!input ? '' : input);
    input = input.replaceAll('&quot;', '\"');
    input = input.replaceAll('&amp;', '&');
    //Special characters such as asterisks (*), underscores (_), and tildes (~) must be escaped with the \ character.
    input = input.replaceAll(/[\*]/g, '\\*');
    input = input.replaceAll(/[\_]/g, '\\_');
    input = input.replaceAll(/[\~]/g, '\\~');
    let strRegEx = /[\u{1f300}-\u{1f5ff}\u{1f900}-\u{1f9ff}\u{1f600}-\u{1f64f}\u{1f680}-\u{1f6ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}\u{1f1e6}-\u{1f1ff}\u{1f191}-\u{1f251}\u{1f004}\u{1f0cf}\u{1f170}-\u{1f171}\u{1f17e}-\u{1f17f}\u{1f18e}\u{3030}\u{2b50}\u{2b55}\u{2934}-\u{2935}\u{2b05}-\u{2b07}\u{2b1b}-\u{2b1c}\u{3297}\u{3299}\u{303d}\u{00a9}\u{00ae}\u{2122}\u{23f3}\u{24c2}\u{23e9}-\u{23ef}\u{25b6}\u{23f8}-\u{23fa}]/ug;
    input = input.replaceAll(strRegEx, ''); //strip out emojis, idk how to handle these otherwise
    return input;
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
        //extract data from ao3 html code into json object
        let ao3 = await ao3api(linkURL);
        const feedChannel = client.channels.cache.get(FEEDID);

        //set user-defined parameters (someday)
        const workauthorlength = 230; //max 230 to allow for label text (10) and possible spaces, commas, and elipsis (cannot exceed 256)
        const worksummarylength = 400; //max 1024
        const worktaglength = 400; //max 1024
        const seriesdesclength = 400;
        const worktitlelength = 256; //max 256

        if (ao3.error) {
            //work is restricted or unavailable 
            linkType = linkType.split(' ')[0].charAt(0).toUpperCase() + linkType.split(' ')[0].slice(1);
            responseText = new EmbedBuilder()
                .setColor(0x808080)
                .setTitle(`Preview not available. ${linkType} may be restricted or unavailable. Click here to view.`)
                .setURL(linkURL)
                .setDescription(`Link posted by <@${msgAuthor}> in https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`)
        } else {
            if (ao3.type == 'work') {
                //set limits on authors, summary and tag string lengths and append elipsis if truncated
                let authorstr = (ao3.workAuthor ?? 'None').substring(0, workauthorlength); 
                authorstr = authorstr.length == workauthorlength ? authorstr + ' ...' : authorstr;
                let summarystr = (ao3.workSummary ?? 'None').substring(0, worksummarylength);
                summarystr = summarystr.length == worksummarylength ? summarystr + ' ...' : summarystr;
                let tagstr = (ao3.workFreeform ?? 'None').substring(0, worktaglength);
                tagstr = tagstr.length == worktaglength ? tagstr + ' ...' : tagstr;
                let ratingstr = //shorten rating text
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
                    if (authorstr.includes(',')) { //if there is a comma in the list of authors
                        responseText.setAuthor({
                            name: 'A work by ' + authorstr.replace(/, \(/g, ' ('), //display full author list but no url, take out extra commas
                        });
                    } else  {//else strip out any psuedonym and set the url
                        authorstr = authorstr.replace(/\(.*$/, "").trim();
                        responseText.setAuthor({
                            name: 'A work by ' + authorstr, //display full author name with any psuedonym, limited to 256 characters
                            url: `http://archiveofourown.org/users/${authorstr}` //only link main name
                        });
                    }
                responseText.setDescription(
                        ` Link posted by <@${msgAuthor}> in ` +
                        `https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`
                    );
                if (ao3.workSeries !== '') { //add series text first, if it exists
                    responseText.addFields({
                        name: '\t', //name blank
                        value: sanitize(ao3.workSeries.substring(0, 1024)) //in value because string contains link
                    });
                }    
                if (ao3.workPublished) {
                    let strName = 'Published';
                    let strValue = ao3.workPublished.substring(0, 100);
                    if (ao3.workComplete) { //if the work is complete
                        strName = 'Published | Completed';
                        if (ao3.workUpdated) { //and has an updated date use that
                            strValue = strValue + ' | ' + ao3.workUpdated.substring(0, 100);
                        } else { //if its complete but has no updated date use published date (chapters are 1/1)
                            strValue = strValue + ' | ' + strValue;
                        };
                    } else { //if workcomplete is false only print published date, unless an updated date exists
                        let strUpdated = ao3.workUpdated ? ao3.workUpdated.substring(0, 100) : '';
                        strName = 'Published' + (strUpdated.length > 0 ? ' | Updated' : '');
                        strValue = strValue + (strUpdated.length > 0 ? ' | ' + strUpdated : '');
                    };
                    responseText.addFields({ name: strName, value: strValue, inline: true });
                };
                console.log(`4 - responseText: ${JSON.stringify(responseText)}`);
                responseText.addFields(
                    {
                        name: 'Words | Chapters',
                        value: (ao3.workWords + ' | ' + ao3.workChapters).substring(0, 100),
                        inline: true
                    });
                    console.log(`5 - responseText: ${JSON.stringify(responseText)}`);

                    responseText.addFields(
                    {//compare text to ratingstr and set the appropriate icon
                        name: 'Rating | Warning',
                        value: ({
                            "Not Rated": ':black_circle: ',
                            "General": ':blue_circle: ',
                            "Teen": ':green_circle: ',
                            "Mature": ':yellow_circle: ',
                            "Explicit": ':red_circle: '
                        })[ratingstr] +
                            ratingstr + ' | ' + ao3.workWarning.substring(0, 100)
                    });
                    console.log(`6 - responseText: ${JSON.stringify(responseText)}`);

                    responseText.addFields(
                    {
                        name: 'Fandom',
                        value: sanitize(ao3.workFandom.substring(0, 1024)), //work can have 75 total tags of 100 characters or less but field is limited to 1024 characters
                        inline: true
                    });
                    console.log(`7 - responseText: ${JSON.stringify(responseText)}`);

                    responseText.addFields(
                    {
                        name: 'Category',
                        value: ao3.workCategory.substring(0, 100),
                        inline: true
                    });
                    console.log(`8 - responseText: ${JSON.stringify(responseText)}`);

                    responseText.addFields(
                    //blank field to make two column line break
                    {
                        name: '\t',
                        value: '\t'
                    });
                    responseText.addFields(
                    {
                        name: 'Relationship',
                        value: sanitize(ao3.workRelationship),
                        inline: true
                    });
                    console.log(`9 - responseText: ${JSON.stringify(responseText)}`);

                    responseText.addFields(
                    {
                        name: 'Character',
                        //value: sanitize(ao3.workCharacter),
                        value: (ao3.workCharacter == null ? '\t' : ao3.workCharacter),
                        inline: true
                    });
                    console.log(`10 - responseText: ${JSON.stringify(responseText)}`);

                    responseText.addFields(
                    {
                        name: 'Tags',
                        value: sanitize(tagstr)
                    });
                    console.log(`11 - responseText: ${JSON.stringify(responseText)}`);

                    responseText.addFields(
                    {
                        name: 'Summary',
                        value: sanitize(summarystr)
                    }
                )
                    .setFooter({
                        text: 'Kudos: ' + (ao3.workKudos ?? 0) + 
                            ' | Comments: ' + (ao3.workComments ?? 0) + 
                            ' | Bookmarks: ' + (ao3.workBookmarks ?? 0) +
                            ' | Hits: ' + (ao3.workHits ?? 0) 	
                    });
                console.log(`5 final - ${JSON.stringify(responseText)}`);
            } else if (ao3.type == 'series') {
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
                    if (ao3.seriesCreator.includes(',')) { //if there is a comma in the list of creators
                        responseText.setAuthor({ 
                            name: 'A series by ' + ao3.seriesCreator //display a list of all creators without a link
                        });
                    } else { //if its a single creator
                        let cleanCreator = ao3.seriesCreator.replace(/\(.*$/, "").trim(); //strip out anything after an open paren
                        responseText.setAuthor({
                            name: 'A series by ' + ao3.seriesCreator, //display full creator name with any psuedonym
                            url: 'https://archiveofourown.org/users/' + cleanCreator //only link the main name
                        });                        
                    }
                    responseText.addFields(
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
                    );
                    responseText.setFooter({
                        text: 'Complete: ' + ao3.seriesComplete + ' | Bookmarks: ' + (ao3.bookmarks ?? 0)
                    })
            } else if (ao3.type == 'collection') {
                responseText = new EmbedBuilder();
                responseText.setColor(0xFF6600);
                responseText.setTitle(ao3.collectionTitle);
                responseText.setURL(linkURL);
                responseText.setDescription(`:orange_circle: Link posted by <@${msgAuthor}> in https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`);
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
    console.log(`2 - start of ao3api`);
    try {
        let strType = '';
        let strRegex = '';
        let dataArray = [];
        responseText = await fetch(link).then(response => response.text());
        if (!responseText) return { error: true };
        let metadata = {};
        //check if link is for works, series, or collections
        if (link.includes("works")) {
            console.log(`3 - processing work`);
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
console.log(`4 - scraped data: ${JSON.stringify(metadata)}`);
            //grab data not easily scraped
            strType = 'title';
            strRegex = /<h2 class="title heading">\n\s*(.*)\n\s*<\/h2>/;
            dataArray = await getData(responseText, errorCount, strType, strRegex);
            metadata.workTitle = dataArray[0].trim();
            errorCount = dataArray[1];
console.log(`5 - add title: ${JSON.stringify(metadata)}`);
            strType = 'author';
            //use regex that will skip the chapter number, else just get the author(s) 
            strRegex = (metadata.workChapters !== '1/1' ? //if chapter is not 1/1 then there's a chapter number in the title,
                /<title>\s*.*? - Chapter \d - (.*?) - / :
                /<title>\s*.*? - (.*?) - /);
            dataArray = strRegex.exec(responseText);
            dataArray = dataArray[1].match(/([^, ]+)/g);
            if (!dataArray) {
                metadata.workAuthor = '';
                errorCount++;
                console.log(`Does not have or failed to match ${strType}, error count: ${errorCount}`);
            } else { //put all the authors into one string
                metadata.workAuthor = dataArray.join(', ');
            }
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
//            strRegex = /<span class="series">\n\s+<span class="position">\n\s+(.*?)<a href="(.*?)">(.*?)<\/a>\n\s+<\/span>/;
            strRegex = /<span class="series"><span class="position">(.*?)<a href="(.*?)">(.*?)<\/a><\/span>/;
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
            strType = 'creator'; //crazy gymnastics to handle multiple authors
            strRegex = /<title>\s*.*?- (.*?) -/;
            dataArray = strRegex.exec(responseText);
            dataArray = dataArray[1].match(/([^, ]+)/g);
            if (!dataArray) {
                metadata.seriesCreator = '';
                errorCount++;
                console.log(`Does not have or failed to match ${strType}, error count: ${errorCount}`);
            } else {
                metadata.seriesCreator = dataArray.join(', ');
            }
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
            //strRegex = /<div class="icon">[\s\S]*<img alt="" src="([^"]+)"/;
            strRegex = /<div class="icon">\s*<img alt=".*?" src="(.*?)"/;
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