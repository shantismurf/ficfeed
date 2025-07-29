import { REST, Routes } from 'discord.js';
import { testEnvironment } from './utilities.js';
//import config from './config.json' assert { type: 'json' }; 
//import('./config.json', { assert: { type: 'json' } }).then(config => {
import fs from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const configPath = path.join(__dirname, 'config.json');
const configFile = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(configFile);

// Use the config object here    
const test = testEnvironment();
const CLIENTID = test ? config.TESTCLIENTID : config.CLIENTID;
const TOKEN = config.TOKEN;
const GUILD = config.GUILD;

const commands = [];
// Grab all the command folders from the commands directory you created earlier
//const foldersPath = path.join(__dirname, 'commands');
//const commandFolders = fs.readdirSync(foldersPath);

//for (const folder of commandFolders) {
    // Grab all the command files from the commands directory you created earlier
//    const commandsPath = path.join(foldersPath, folder);
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    // Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
    for (const file of commandFiles) {
        const filePath = `file://${path.join(commandsPath, file)}`;
        const command = await import(filePath);
        if ('data' in command.default && 'execute' in command.default) {
            commands.push(command.default.data.toJSON());
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
//}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(TOKEN);

// and deploy your commands!
(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // The put method is used to fully refresh all commands in the guild with the current set
        const data = await rest.put(
            Routes.applicationGuildCommands(CLIENTID, GUILD),
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        // And of course, make sure you catch and log any errors!
        console.error(error);
    }
})();