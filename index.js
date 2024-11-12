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
const { TOKEN } = require('./config.json');
const { FEEDID } = require('./config.json');
const { GUILD } = require('./config.json');
const now = new Date();
// When the client is ready, run this code (only once).
client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});
// Listen for messages
client.on('messageCreate', message => {
    if (message.author.bot) return; // Ignore messages from bots  
    const linkMatch = message.content.match(/archiveofourown.org\/works\/\d{1,12}/g) ?? [];
    const msgID = message.id;
    const msgAuthor = message.author.id;
    const msgChannel = message.channel.id;
    if (linkMatch.length > 0) {
        linkMatch.forEach((link) => {
            buildEmbed(link, msgID, msgAuthor, msgChannel);
        });
        //console.log(`Link match: ${linkMatch}, ${msgID}, ${msgAuthor}, ${msgchannel} at ${now.toISOString()}`);
    //} else {
        //console.log('Link not found at ${now.toISOString()}');
    }
});

async function buildEmbed(linkURL, msgID, msgAuthor, msgChannel) {
    try {
        //extract data from ao3 html code into json object
        let ao3 = await ao3api('https://' + linkURL);
        //check for restricted work error, build embed, and send
        let res = null;
        const feedChannel = client.channels.cache.get(FEEDID);
        if (ao3.error) {
            res = await feedChannel.send({
                embeds: [{
                    title: 'Preview not available. Click here to see work.',
                    url: `https://${linkURL}`,
                    description:
                        `Posted by <@${msgAuthor}> in https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}`,
                    color: 0x0000FF,
                }]
            });
        } else {
            //set limits on summary and tag string lengths and append elipsis if truncated
            let summarystr = (ao3.summary ?? 'None').substring(0, 400);
            summarystr = summarystr.length == 400 ? summarystr + ' ...' : summarystr;
            let tagstr = (ao3.freeform ?? 'None').substring(0, 400);
            tagstr = tagstr.length == 400 ? tagstr + ' ...' : tagstr;
            //shorten rating text here
            let ratingstr = ao3.rating==="General Audiences"?"General":ao3.rating==="Teen And Up Audiences"?"Teen":ao3.rating;
            res = await feedChannel.send({
                embeds: [{
                    title: ao3.title,
                    url: `https://${linkURL}`,
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
            })
        }
    } catch (error) {
		console.error(`${now.toISOString()} : Error fetching AO3 metadata from ${linkURL}\nIn post https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}}):\n${error}`);
    }
}
async function ao3api(link) {
    var errorCount = 0;
    try {
        var res = await fetch(link).then(e => e.text());
        if (!res)
            return { error: true };
        var cur;
        var v = {};
        var rx = /<dd class="(.*?)(?<!stats)( tags)?">(.*?)<\/dd>/gs;
        while (cur = rx.exec(res)) {
            var ry = /(?<=<a class="tag" href=".*?">).*?(?=<\/a>)/gs;
            var ml = [];
            var m = '';
            var i = 0;
            while ((m = ry.exec(cur[3])) && i++ < 100)
                ml.push(m);
            if (ml.length == 0)
                ml = [cur[3]];
            v[cur[1]] = ml.join(', ').replaceAll('&#39;', "'");
        };
        const titleMatch = res.match(/<h2 class="title heading">(.*?)<\/h2>/s);
        if (titleMatch) {
            v.title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
        } else {
            console.error('Failed to match title');
            v.title = '';
            errorCount++;
        }
        const authorMatch = res.match(/(?<=<a rel="author" href=".*?">).*?(?=<\/a>)/s);
        if (authorMatch) {
            v.author = authorMatch[0];
        } else {
            console.error('Failed to match author');
            v.author = '';
            errorCount++;
        }
        const authorLinkMatch = res.match(/(?<=<a rel="author" href=").*?(?=">)/s);
        if (authorLinkMatch) {
            v.authorlink = 'https://archiveofourown.org' + authorLinkMatch[0];
        } else {
            console.error('Failed to match author link');
            v.authorlink = '';
            errorCount++;
        }
        const summaryMatch = res.match(/<h3 class="heading">Summary:<\/h3>\s*<blockquote class="userstuff">([\s\S]*?)<\/blockquote>/s);
        if (summaryMatch) {
            const summary = summaryMatch[0]
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
            v.summary = summary;
        } else {
            console.error('Failed to match summary');
            v.summary = '';
            errorCount++;
        }
        const publishedMatch = res.match(/<dd class="published">.*?<\/dd>/);
        if (publishedMatch) {
            v.published = publishedMatch[0].replace(/<dd class="published">|<\/dd>/g, '');
        } else {
            console.error('Failed to match published date');
            v.publishedDate = '';
            errorCount++;
        }
        const updatedDateMatch = res.match(/<dd class="status">(.*?)<\/dd>/);
        if (updatedDateMatch) {
            v.updatedDate = updatedDateMatch[1];
        } else {
            console.error('Failed to match updated date');
            v.updatedDate = '';
            errorCount++;
        }
        if (errorCount > 5) {
            return { error: true };
        }
        console.log(`Link processed at ${now.toISOString()} had ${errorCount} error(s).`);
        return v;
    } catch (e) {
        console.log(`Link processed at ${now.toISOString()} failed.`);
        console.error(e)
        return { error: e }
    }
}
// Log in to Discord with your client's token
client.login(TOKEN);