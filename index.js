import {Collection, Events, EmbedBuilder} from 'discord.js';
import { buildEmbed } from './ficfeed.js';
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
    if (!interaction.isChatInputCommand()) return;
    console.log(`${formattedDate()}: ${interaction.user.username} in #${interaction.channel.name} triggered ${interaction.commandName}.`);
    try {
        //client.commands.get(interaction.commandName)?.run(client, interaction);
        const command = interaction.client.commands.get(interaction.commandName);
        await command.execute(interaction);
    } catch (e) {
        console.log(e);
    }
});
// Listen for messages
//const systemMessage = `-# Use '\_ \_' before a link to disable the bot.`;
client.on('messageCreate', async message => {
    if (message.author.bot) return; // Ignore messages from bots 
    const msgID = message.id;
    const msgChannel = message.channel.id;
    const urlRegex = /https?:\/\/archiveofourown\.org\/(works|series)\/\d{1,12}|https?:\/\/archiveofourown\.org\/collections\/[^>\]\)"\s]+/g;
    const urlRegexLookbehind = /([^a-zA-Z0-9]{4})\b(https?:\/\/archiveofourown\.org\/(works|series)\/\d{1,12}|https?:\/\/archiveofourown\.org\/collections\/[^>\]\)"\s]+)/g;
    let match;
    //make an array of all urls
    while ((match = urlRegex.exec(message.content)) !== null) {
        let url = match[0]; // get one URL from the array
        let linkMatch = urlRegexLookbehind.exec(message.content); //look for any two special characters before it
        if (linkMatch) {
            let prefix = linkMatch[1]; // get the two characters before the URL
            if (['_ _ ', ' _ <'].includes(prefix)) { //if they match a skip prefix
                console.log(`***Skip Prefix posted in https://discord.com/channels/${GUILD}/${msgChannel}/${msgID}: "${prefix}" used to skip link ${url} at ${formattedDate()}`);
            } else { //process the url 
                if (url.includes('collections') && url.includes('works')) { //rebuild url with work ID for collection work links
                    url = new URL(url);
                	const matchWork = url.pathname.match(/\/works\/(\d+)/);
                	const workId = matchWork[1];
                	url = `${url.origin}/works/${workId}`;
            	}
                console.log(`***Link with prefix match at ${formattedDate()}: ${url}`);
                await buildEmbed(url, message);
            }
        } else { //no characters before url, process normally
		    if (url.includes('collections') && url.includes('works')) { //rebuild url with work ID for collection work links
                url = new URL(url);
               	const matchWork = url.pathname.match(/\/works\/(\d+)/);
               	const workId = matchWork[1];
               	url = `${url.origin}/works/${workId}`;
            }
            console.log(`***Link match at ${formattedDate()}: ${url}`);
            await buildEmbed(url, message);
        }
    }
});
// Log in to Discord with your client's token
client.login(TOKEN);