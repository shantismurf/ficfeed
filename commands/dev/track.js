import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

/* TEMPORARILY DISABLED FOR DEVELOPMENT
 * Tracker commands are under development and will be consolidated using subcommands.
 * To re-enable: uncomment the export default block below and remove this comment.
 */

// export default {
const trackCommand = {
    data: new SlashCommandBuilder()
        .setName('track')
        .setDescription('Track an AO3 work using a form'),
    async execute(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('trackAo3Modal')
            .setTitle('Track AO3 Work');

        const urlInput = new TextInputBuilder()
            .setCustomId('workUrl')
            .setLabel('AO3 Work URL')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const statusInput = new TextInputBuilder()
            .setCustomId('status')
            .setLabel('Status (to read, reading, finished)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        const notesInput = new TextInputBuilder()
            .setCustomId('notes')
            .setLabel('Notes')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(urlInput),
            new ActionRowBuilder().addComponents(statusInput),
            new ActionRowBuilder().addComponents(notesInput)
        );

        await interaction.showModal(modal);
    },
};