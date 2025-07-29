import { untrackAo3Link } from '../tracker.js';

export default {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove a tracked AO3 work')
        .addStringOption(option =>
            option.setName('url').setDescription('AO3 work URL').setRequired(true)
        ),
    async execute(interaction) {
        const url = interaction.options.getString('url');
        await untrackAo3Link(interaction.user.id, url);
        await interaction.reply('AO3 work removed from your list.');
    },
};