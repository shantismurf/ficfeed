import { updateAo3Link } from '../tracker.js';

export default {
    data: new SlashCommandBuilder()
        .setName('update')
        .setDescription('Update a tracked AO3 work')
        .addStringOption(option =>
            option.setName('url').setDescription('AO3 work URL').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('status').setDescription('New status').setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName('chapter').setDescription('Last chapter read').setRequired(false)
        )
        .addStringOption(option =>
            option.setName('notes').setDescription('Notes').setRequired(false)
        ),
    async execute(interaction) {
        const url = interaction.options.getString('url');
        const status = interaction.options.getString('status');
        const lastChapterRead = interaction.options.getInteger('chapter');
        const notes = interaction.options.getString('notes');
        await updateAo3Link(interaction.user.id, url, { status, lastChapterRead, notes });
        await interaction.reply('AO3 work updated!');
    },
};