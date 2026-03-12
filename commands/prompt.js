import { SlashCommandBuilder } from 'discord.js';

const PROMPT_WORDS = [
    // Atmosphere
    'dawn', 'dusk', 'sunrise', 'sunset', 'sun', 'moon', 'stars', 'clouds',
    'threshold', 'fog', 'ember', 'lantern', 'shadow', 'tide', 'ruins',
    'hollow', 'dusk', 'labyrinth', 'cellar', 'crossroads', 'shoreline',
    'attic', 'wilderness', 'archive', 'corridor', 'clearing', 'tower',

    // Objects
    'book', 'pen', 'pencil', 'paper', 'ink', 'inkwell', 'inkpot', 'quill', 
    'mirror', 'anchor', 'clockwork', 'veil', 'key', 'compass', 'locket',
    'manuscript', 'mask', 'wire', 'candle', 'map', 'lens', 'thread',
    'photograph', 'sigil', 'relic', 'chain', 'parchment', 'scroll',
    'potion', 'pouch', 'vial', 'ointment', 'gemstone', 'crystal',

    // Abstract
    'hollow', 'dusk', 'labyrinth', 'cellar', 'crossroads', 'shoreline',
    'attic', 'wilderness', 'archive', 'corridor', 'clearing', 'lighthouse',
    'hunger', 'fracture', 'silence', 'echo', 'longing', 'debt', 'mercy',
    'grief', 'spite', 'wonder', 'dread', 'trust', 'betrayal', 'hope',
    'obsession', 'surrender', 'guilt', 'pride',

    // Nature   
    'stone', 'water', 'fire', 'air', 'earth', 'light', 'darkness',
    'rust', 'bloom', 'current', 'husk', 'marrow', 'spark', 'frost',
    'ash', 'salt', 'root', 'storm', 'decay', 'growth', 'stone', 'smoke',

    // Action
    'whisper', 'chase', 'escape', 'search', 'capture', 'rescue', 
    'pursuit', 'bargain', 'unraveling', 'vigil', 'return', 'vanishing', 
    'reckoning', 'collision', 'inheritance', 'transformation', 'destruction',
];

const HISTORY_SIZE = 25;
const recentWords = [];

function pickWord() {
    const available = PROMPT_WORDS.filter(w => !recentWords.includes(w));
    const word = available[Math.floor(Math.random() * available.length)];

    recentWords.push(word);
    if (recentWords.length > HISTORY_SIZE) recentWords.shift();

    return word;
}

export default {
    data: new SlashCommandBuilder()
        .setName('prompt')
        .setDescription('Get a single-word writing prompt'),

    async execute(interaction) {
        const word = pickWord();
        await interaction.reply(`✍️ Your word is: **${word}**`);
    },
};
