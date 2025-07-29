import {Collection, Events, EmbedBuilder} from 'discord.js';
import ao3api from './ao3api.js';
import { DiscordClient, sanitize, userStats, formattedDate, testEnvironment } from './utilities.js';
import fs from 'fs';
import config from './config.json' with { type: 'json' };
const test = testEnvironment(); //set in utilities.js
const FEEDID = test ? config.TESTFEEDID : config.FEEDID;
const ADULTFEEDID = test ? config.TESTADULTFEEDID : config.ADULTFEEDID;
//const BOTUSERID = test ? config.TESTCLIENTID : config.CLIENTID;
const TOKEN = test ? config.TESTTOKEN : config.TOKEN;
const GUILD = config.GUILD;

// Create a new client instance
const client = DiscordClient.getInstance();
// Create initiate slash commands
client.commands = new Collection();
async function loadCommands(dir) {
    try {
      const files = await fs.promises.readdir(dir);
      for (const file of files) {
        const filePath = `${dir}/${file}`;
        const stat = await fs.promises.stat(filePath);
        if (stat.isDirectory()) {
          await loadCommands(filePath);
        } else if (file.endsWith('.js')) {
          const command = await import(filePath);
          if (command.default && command.default.data) {
            console.log(`Loaded command: ${command.default.data.name}`);
            client.commands.set(command.default.data.name, command.default);
          } else {
            console.log(`Skipping file ${filePath} as it doesn't export a command`);
          }
        }
      }
    } catch (error) {
      console.error(error);
    }
  }
// When the client is ready, run this code (only once).
client.once(Events.ClientReady, async () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    await loadCommands('./commands');
});
// Listen for slash commands
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        // Handle slash commands
        console.log(`${formattedDate()}: ${interaction.user.username} in #${interaction.channel.name} triggered ${interaction.commandName}.`);
        try {
            const command = interaction.client.commands.get(interaction.commandName);
            await command.execute(interaction);
        } catch (e) {
            console.log(e);
        }
    } else if (interaction.isModalSubmit()) {
        // Handle modal submissions
        if (interaction.customId === 'trackAo3Modal') {
            const workUrl = interaction.fields.getTextInputValue('workUrl');
            const status = interaction.fields.getTextInputValue('status') || 'to read';
            const notes = interaction.fields.getTextInputValue('notes') || '';
            // Call your tracker function here
            await trackAo3Link(interaction.user.id, workUrl, status, '', '', notes);
            await interaction.reply({ content: 'Tracker updated!', ephemeral: true });
        }
        // Add more modal handlers here as needed
    }
});
/*
import { setTimeout } from 'node:timers/promises';
const wait = setTimeout;
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	if (interaction.commandName === 'library') {
		await interaction.deferReply();
		await wait(4_000);
		await interaction.editReply('Library entry submitted.');

	}
});
*/
// Listen for messages
//const systemMessage = `-# Use '\_ \_' before a link to disable the bot.`;
client.on('messageCreate', async message => {
    if (message.author.bot) return; // Ignore messages from bots 
    if (JSON.stringify(message.author.id) == '426071848342781963') nololShanti(message); //remove lol from the end of my messages
    const msgID = message.id;
 //   const msgAuthor = message.author.id;
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
                console.log(`***Skip Prefix posted in https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}: "${prefix}" used to skip link ${url} at ${formattedDate()}`);
            } else { //process the url normally
                console.log(`***Link match at ${formattedDate()}: ${url}`);
                //await buildEmbed(url, msgID, msgAuthor, msgChannel);
                await buildEmbed(url, message);
            }
        } else { //no characters before url, process normally
            console.log(`***Link match at ${formattedDate()}: ${url}`);
            //await buildEmbed(url, msgID, msgAuthor, msgChannel);
            await buildEmbed(url, message);
        }
    }
});
const dailyLOLCount = {};
async function nololShanti(message) {
    const now = formattedDate();
    const today = now.slice(0, 10);
    if (message.content.endsWith('lol')){
        await message.react('❕'); 
        dailyLOLCount[today] = (dailyLOLCount[today] || 0) + 1; //increment daily lol count
        console.log(`(${now} - lol at https://discord.com/channels/${GUILD}/${message.channel.id}/${message.id}, ${dailyLOLCount[today]} times today)`);
    } 
}
// async function batsignal(){
//   const feedChannel = client.channels.cache.get(FEEDID);
//   await feedChannel.send(`https://i.imgur.com/Wcg7amv.jpeg\n-# image by [@notgilderoylockhart](https://www.tumblr.com/notgilderoylockhart/776922836507951104/)`);
// }
// "subscribing to a fic isn’t enough I need the author to blast a bat signal into the night sky whenever they update"
// register a list of members ao3 names linked to discord ids, 
// if updated date is today, do a lookup on the list, check if they are still a member? update list when user leaves?
// where to store? json? sql?
//  if member is in list, send batsignal()
//async function buildEmbed(linkURL, msgID, msgAuthor, msgChannel) {
async function buildEmbed(linkURL, message) {    
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
        const linkType = (!ao3.type ? 'link' : ao3.type);
        if (ao3.setError) {
            console.log(`*!*!*!Restricted work or error at ${formattedDate()}`);
            //link is restricted or unavailable 
            responseText = new EmbedBuilder()
                .setColor(0x808080)
                //.setTitle(`Preview not available. The ${linkType} may be restricted or unavailable. Click here to view.
                //    \n(${ao3.error?.match(/code\s.*/)?.[0] ?? 'Restricted'})`)
                .setTitle(`Preview not available. The ${linkType} may be restricted or the Archive is unavailable. Click here to view.\n(${/code\s.*/.exec(ao3.error) ?? ao3.setError})\n`)
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
                if (ao3.workSeries && Array.isArray(ao3.workSeries) && ao3.workSeries.length > 0) {
                    responseText.addFields({
                        name: 'Series',
                        value: ao3.workSeries.map(s => `Part ${s.part} of [${sanitize(s.title)}](${s.url})`).join('\n'),
                        inline: false
                    });
                }
                if (test) console.log(`00-series: ${ao3.workSeries}`);
                if (ao3.workCollections && Array.isArray(ao3.workCollections) && ao3.workCollections.length > 0) {
                    responseText.addFields({
                        name: 'Collections',
                        value: ao3.workCollections.map(c => `[${sanitize(c.title)}](${c.url})`).join('\n'),
                        inline: false
                    });
                }
                if (test) console.log(`01-collections: ${ao3.workCollections}`);
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
                        value: ao3.workCategory,
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
        console.log(`***responseText: ${JSON.stringify(responseText)}`);
        console.log(`***Link type: ${linkType}: ${linkURL} processed at ${formattedDate()}.`);

        //send the message, divert or duplicate to the adultFeedChannel
        if (linkType === 'work') {
            const workRating = ao3.workRating ?? '';
            if (processAdultLinks == 1) {
                // Send all posts to feedChannel
                await feedChannel.send({ embeds: [responseText] });
            } else if (processAdultLinks == 2) {
                // Send all posts to feedChannel and duplicate adult posts to adultFeedChannel
                await feedChannel.send({ embeds: [responseText] });
                if (workRating.includes('Mature') || workRating.includes('Explicit')) {
                    await adultFeedChannel.send({ embeds: [responseText] });
                    console.log(`***processAdultLinks: ${processAdultLinks}, rating: ${workRating}, adultFeedChannel: ${adultFeedChannel.name}`);
                }
            } else if (processAdultLinks == 3) {
                //Filter adult works to adultFeedChannel and Send other ratings to feedChannel
                if (workRating.includes('Mature') || workRating.includes('Explicit')) {
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
        console.log(`*!*!*!Error sending message at ${formattedDate()}: ${error}`);
    }
}
// Log in to Discord with your client's token
client.login(TOKEN);