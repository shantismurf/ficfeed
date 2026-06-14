import { SlashCommandBuilder } from 'discord.js';
import { readFile } from 'fs/promises';

const HISTORY_SIZE = 25;
const recentWords = [];

async function pickWord() {
    const raw = await readFile('./commands/promptWords.json', 'utf-8');
    const words = Object.values(JSON.parse(raw)).flat();
    const available = words.filter(w => !recentWords.includes(w));
    const word = available[Math.floor(Math.random() * available.length)];

    recentWords.push(word);
    if (recentWords.length > HISTORY_SIZE) recentWords.shift();

    return word;
}

const command = {
    data: new SlashCommandBuilder()
        .setName('prompt')
        .setDescription('Get a single-word writing prompt'),

    async execute(interaction) {
        const word = await pickWord();
        await interaction.reply(`✍️ Your word is: **${word}**`);
    },
};

export default command;
