require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, ChannelType, AttachmentBuilder } = require('discord.js');
const { Pool } = require('pg');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

const MIDDLEMAN_CATEGORY_ID = '1431066258303877171';
const MIDDLEMAN_ROLE_ID = '1431066232970416330';
const TRANSCRIPTS_CHANNEL_ID = '1431066283465380008';
const PREFIX = '.';

const closeInitiators = new Map();

async function getTicketData(channelId) {
    const result = await pool.query('SELECT * FROM tickets WHERE channel_id = $1', [channelId]);
    if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
            creator: row.creator_id,
            otherUser: row.other_user_id,
            otherUserInput: row.other_user_input,
            tradeDetails: row.trade_details,
            canJoinVip: row.can_join_vip,
            claimed: row.claimed,
            claimer: row.claimer_id
        };
    }
    return null;
}

async function saveTicketData(channelId, data) {
    await pool.query(
        `INSERT INTO tickets (channel_id, creator_id, other_user_id, other_user_input, trade_details, can_join_vip, claimed, claimer_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (channel_id) DO UPDATE SET
            claimed = EXCLUDED.claimed,
            claimer_id = EXCLUDED.claimer_id`,
        [channelId, data.creator, data.otherUser, data.otherUserInput, data.tradeDetails, data.canJoinVip, data.claimed, data.claimer]
    );
}

async function deleteTicketData(channelId) {
    await pool.query('DELETE FROM tickets WHERE channel_id = $1', [channelId]);
}

client.once('ready', async () => {
    console.log(`✅ Bot is online as ${client.user.tag}!`);
    console.log(`📋 Prefix: ${PREFIX}`);
    console.log(`🎫 Middleman Category ID: ${MIDDLEMAN_CATEGORY_ID}`);
    console.log(`👥 Middleman Role ID: ${MIDDLEMAN_ROLE_ID}`);
    console.log(`📄 Transcripts Channel ID: ${TRANSCRIPTS_CHANNEL_ID}`);
    console.log(`💾 Database connected`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'send') {
        try {
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🛡️ Middleman Service')
                .setDescription(
                    'Found a trade and would like to ensure a safe trading experience?\n\n' +
                    '## Open a ticket below\n\n' +
                    '**What we provide:**\n' +
                    '• We provide safe traders between 2 parties\n' +
                    '• We provide fast and easy deals\n\n' +
                    '## Important Notes\n' +
                    '• Both parties must agree before opening a ticket\n' +
                    '• Fake/Troll tickets will result into a ban or ticket blacklist\n' +
                    '• Follow Discord Terms of Service and server guidelines'
                )
                .setImage('attachment://sab_1762725840806.jpg')
                .setTimestamp();

            const button = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('request_ticket')
                        .setLabel('Request')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎫')
                );

            await message.channel.send({
                embeds: [embed],
                components: [button],
                files: [{
                    attachment: './attached_assets/sab_1762725840806.jpg',
                    name: 'sab_1762725840806.jpg'
                }]
            });

            if (message.deletable) {
                await message.delete().catch(() => {});
            }

        } catch (error) {
            console.error('Error sending embed:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription('❌ An error occurred while sending the message.');
            await message.reply({ embeds: [errorEmbed] }).catch(() => {});
        }
    }

    if (command === 'add') {
        try {
            const data = await getTicketData(message.channel.id);
            if (!data) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setDescription('❌ This command can only be used in ticket channels.');
                return message.reply({ embeds: [embed] });
            }

            const member = await message.guild.members.fetch(message.author.id);
        
            if (!member.roles.cache.has(MIDDLEMAN_ROLE_ID) && data.claimer !== message.author.id) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setDescription('❌ Only middleman team members or the ticket claimer can add users.');
                return message.reply({ embeds: [embed] });
            }

            if (!args[0]) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setDescription('❌ Please mention a user or provide their ID.\nUsage: `.add @user` or `.add 123456789`');
                return message.reply({ embeds: [embed] });
            }

            let userToAdd = null;
            const userInput = args[0].replace(/[<@!>]/g, '');

            if (userInput.match(/^\d+$/)) {
                userToAdd = await message.guild.members.fetch(userInput);
            } else {
                const members = await message.guild.members.fetch();
                userToAdd = members.find(member => 
                    member.user.username.toLowerCase() === userInput.toLowerCase()
                );
            }

            if (!userToAdd) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setDescription('❌ User not found in the server.');
                return message.reply({ embeds: [embed] });
            }

            await message.channel.permissionOverwrites.create(userToAdd.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setDescription(`✅ ${userToAdd} has been added to the ticket.`);
            await message.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error adding user:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription('❌ An error occurred while adding the user.');
            await message.reply({ embeds: [embed] });
        }
    }

    if (command === 'close') {
        try {
            const data = await getTicketData(message.channel.id);
            if (!data) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setDescription('❌ This command can only be used in ticket channels.');
                return message.reply({ embeds: [embed] });
            }

            const member = await message.guild.members.fetch(message.author.id);
            
            if (!member.roles.cache.has(MIDDLEMAN_ROLE_ID) && data.claimer !== message.author.id) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setDescription('❌ Only middleman team members or the ticket claimer can close tickets.');
                return message.reply({ embeds: [embed] });
            }

            closeInitiators.set(`${message.channel.id}_${message.author.id}`, true);

            const confirmEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setDescription('🗑️ Close Ticket?');

            const confirmButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`confirm_close_${message.author.id}`)
                        .setLabel('Close')
                        .setStyle(ButtonStyle.Primary)
                );

            await message.reply({ embeds: [confirmEmbed], components: [confirmButton] });
        } catch (error) {
            console.error('Error in close command:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription('❌ An error occurred while processing the close command.');
            await message.reply({ embeds: [embed] });
        }
    }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton() && interaction.customId === 'request_ticket') {
        const modal = new ModalBuilder()
            .setCustomId('ticket_modal')
            .setTitle('Middleman Ticket Request');

        const tradeDetailsInput = new TextInputBuilder()
            .setCustomId('trade_details')
            .setLabel('Trade Details')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Eg. My frost dragon for his Racoon')
            .setRequired(true)
            .setMaxLength(1000);

        const otherUserInput = new TextInputBuilder()
            .setCustomId('other_user')
            .setLabel('Other User or ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Eg. en5s or 123456789')
            .setRequired(true)
            .setMaxLength(100);

        const vipInput = new TextInputBuilder()
            .setCustomId('can_join_vip')
            .setLabel('Can you join VIP')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Yes/No')
            .setRequired(true)
            .setMaxLength(10);

        const firstRow = new ActionRowBuilder().addComponents(tradeDetailsInput);
        const secondRow = new ActionRowBuilder().addComponents(otherUserInput);
        const thirdRow = new ActionRowBuilder().addComponents(vipInput);

        modal.addComponents(firstRow, secondRow, thirdRow);

        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {
        await interaction.deferReply({ ephemeral: true });

        try {
            const tradeDetails = interaction.fields.getTextInputValue('trade_details');
            const otherUserInput = interaction.fields.getTextInputValue('other_user');
            const canJoinVip = interaction.fields.getTextInputValue('can_join_vip');

            const guild = interaction.guild;
            const ticketCreator = interaction.user;

            let otherUser = null;
            let otherUserNotFound = false;

            if (otherUserInput.match(/^\d+$/)) {
                try {
                    otherUser = await guild.members.fetch(otherUserInput);
                } catch (error) {
                    otherUserNotFound = true;
                }
            } else {
                const cleanUsername = otherUserInput.replace('@', '');
                const members = await guild.members.fetch();
                otherUser = members.find(member => 
                    member.user.username.toLowerCase() === cleanUsername.toLowerCase() ||
                    member.user.tag.toLowerCase() === cleanUsername.toLowerCase()
                );
                if (!otherUser) {
                    otherUserNotFound = true;
                }
            }

            const category = guild.channels.cache.get(MIDDLEMAN_CATEGORY_ID);
            if (!category) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setDescription('❌ Middleman category not found. Please contact an administrator.');
                await interaction.editReply({ embeds: [embed] });
                return;
            }

            const ticketNumber = Date.now().toString().slice(-6);
            const channelName = `ticket-${ticketCreator.username}-${ticketNumber}`;

            const ticketChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: MIDDLEMAN_CATEGORY_ID,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: ticketCreator.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                    },
                    {
                        id: MIDDLEMAN_ROLE_ID,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages]
                    }
                ]
            });

            await saveTicketData(ticketChannel.id, {
                creator: ticketCreator.id,
                otherUser: otherUser ? otherUser.id : null,
                otherUserInput: otherUserInput,
                tradeDetails: tradeDetails,
                canJoinVip: canJoinVip,
                claimed: false,
                claimer: null
            });

            const userStatusText = otherUserNotFound 
                ? `❌ User "${otherUserInput}" not found in the server`
                : `✅ The user is found, use ${otherUser} or \`${otherUser.id}\` to add the person to the ticket.`;

            const welcomeEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🎫 New Ticket Created')
                .setDescription(`Hello ${ticketCreator} and <@&${MIDDLEMAN_ROLE_ID}>!`)
                .addFields(
                    { name: '📝 Trade Details', value: tradeDetails, inline: false },
                    { name: '👤 Other User', value: otherUserNotFound ? `❌ User "${otherUserInput}" not found in the server` : `${otherUser}`, inline: true },
                    { name: '💎 Can Join VIP', value: canJoinVip, inline: true }
                )
                .setTimestamp();

            const statusEmbed = new EmbedBuilder()
                .setColor(otherUserNotFound ? '#FF0000' : '#00FF00')
                .setDescription(userStatusText);

            const waitEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setDescription('⏳ Please wait for a middleman member to claim this ticket and help both parties.');

            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('claim_ticket')
                        .setLabel('Claim')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('unclaim_ticket')
                        .setLabel('Unclaim')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('Close')
                        .setStyle(ButtonStyle.Danger)
                );

            await ticketChannel.send({ embeds: [welcomeEmbed, statusEmbed, waitEmbed], components: [buttons] });

            const successEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setDescription(`✅ Ticket created successfully! ${ticketChannel}`);
            await interaction.editReply({ embeds: [successEmbed] });

        } catch (error) {
            console.error('Error creating ticket:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription('❌ An error occurred while creating the ticket. Please try again or contact an administrator.');
            await interaction.editReply({ embeds: [embed] }).catch(() => {});
        }
    }

    if (interaction.isButton() && interaction.customId === 'claim_ticket') {
        try {
            const data = await getTicketData(interaction.channel.id);
            if (!data) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setDescription('❌ Ticket data not found.');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!member.roles.cache.has(MIDDLEMAN_ROLE_ID)) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setDescription('❌ Only middleman team members can claim tickets.');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (data.claimed) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setDescription('❌ This ticket has already been claimed.');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const updatedData = { ...data, claimed: true, claimer: interaction.user.id };
            await saveTicketData(interaction.channel.id, updatedData);

            await interaction.channel.permissionOverwrites.edit(MIDDLEMAN_ROLE_ID, {
                ViewChannel: false,
                SendMessages: false
            });

            await interaction.channel.permissionOverwrites.create(interaction.user.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                ManageMessages: true
            });

            if (data.otherUser) {
                await interaction.channel.permissionOverwrites.create(data.otherUser, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setDescription(`✅ ${interaction.user} has claimed this ticket.`);
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error claiming ticket:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription('❌ An error occurred while claiming the ticket.');
            await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
        }
    }

    if (interaction.isButton() && interaction.customId === 'unclaim_ticket') {
        try {
            const data = await getTicketData(interaction.channel.id);
            if (!data) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setDescription('❌ Ticket data not found.');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (!data.claimed) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setDescription('❌ This ticket is not currently claimed.');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (data.claimer !== interaction.user.id) {
                const member = await interaction.guild.members.fetch(interaction.user.id);
                if (!member.roles.cache.has(MIDDLEMAN_ROLE_ID)) {
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setDescription('❌ Only the claimer or middleman team can unclaim this ticket.');
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
            }

            const previousClaimer = data.claimer;
            const updatedData = { ...data, claimed: false, claimer: null };
            await saveTicketData(interaction.channel.id, updatedData);

        await interaction.channel.permissionOverwrites.edit(MIDDLEMAN_ROLE_ID, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            ManageMessages: true
        });

        if (previousClaimer) {
            await interaction.channel.permissionOverwrites.delete(previousClaimer).catch(() => {});
        }

            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setDescription(`🔓 ${interaction.user} has unclaimed the ticket.`);
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error unclaiming ticket:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription('❌ An error occurred while unclaiming the ticket.');
            await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
        }
    }

    if (interaction.isButton() && interaction.customId === 'close_ticket') {
        try {
            const data = await getTicketData(interaction.channel.id);
            if (!data) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setDescription('❌ Ticket data not found.');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const member = await interaction.guild.members.fetch(interaction.user.id);
            
            if (!member.roles.cache.has(MIDDLEMAN_ROLE_ID) && data.claimer !== interaction.user.id) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setDescription('❌ Only middleman team members or the ticket claimer can close tickets.');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            closeInitiators.set(`${interaction.channel.id}_${interaction.user.id}`, true);

            const confirmEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setDescription('🗑️ Close Ticket?');

            const confirmButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`confirm_close_${interaction.user.id}`)
                        .setLabel('Close')
                        .setStyle(ButtonStyle.Primary)
                );

            await interaction.reply({ embeds: [confirmEmbed], components: [confirmButton] });
        } catch (error) {
            console.error('Error in close ticket button:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription('❌ An error occurred while processing the close request.');
            await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
        }
    }

    if (interaction.isButton() && interaction.customId.startsWith('confirm_close_')) {
        const initiatorId = interaction.customId.split('_')[2];
        
        if (interaction.user.id !== initiatorId) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription('❌ Only the person who initiated the close can confirm it.');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const closeKey = `${interaction.channel.id}_${initiatorId}`;
        if (!closeInitiators.has(closeKey)) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription('❌ Close confirmation expired. Please initiate close again.');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await interaction.deferReply();

        try {
            const data = await getTicketData(interaction.channel.id);
            if (!data) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setDescription('❌ Ticket data not found.');
                return interaction.editReply({ embeds: [embed] });
            }
            let allMessages = [];
            let lastId;

            while (true) {
                const options = { limit: 100 };
                if (lastId) {
                    options.before = lastId;
                }

                const messages = await interaction.channel.messages.fetch(options);
                allMessages.push(...messages.values());
                
                if (messages.size < 100) {
                    break;
                }
                
                lastId = messages.last().id;
            }

            const sortedMessages = allMessages.reverse();

            let transcript = `Ticket: ${interaction.channel.name}\n`;
            transcript += `Created: ${new Date().toUTCString()}\n`;
            transcript += `${'='.repeat(60)}\n\n`;

            for (const msg of sortedMessages) {
                const timestamp = msg.createdAt.toLocaleString();
                transcript += `[${timestamp}] ${msg.author.tag}:\n`;
                if (msg.content) {
                    transcript += `${msg.content}\n`;
                }
                if (msg.embeds.length > 0) {
                    transcript += `[Embed: ${msg.embeds[0].title || msg.embeds[0].description || 'No title'}]\n`;
                }
                transcript += '\n';
            }

            const transcriptChannel = await interaction.guild.channels.fetch(TRANSCRIPTS_CHANNEL_ID);
            if (!transcriptChannel) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setDescription('❌ Transcript channel not found.');
                return interaction.editReply({ embeds: [embed] });
            }

            let creator;
            try {
                creator = await interaction.guild.members.fetch(data.creator);
            } catch (error) {
                creator = `User ID: ${data.creator} (Left server)`;
            }
            const closer = interaction.user;

            const transcriptEmbed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`📄 Ticket Transcript - ${interaction.channel.name}`)
                .setDescription(
                    `**The opener of ticket:** ${creator}\n\n` +
                    `**Trade Details:** ${data.tradeDetails}\n` +
                    `**Other User or ID:** ${data.otherUserInput}\n` +
                    `**Can you join VIP:** ${data.canJoinVip}\n\n` +
                    `**Closed by:** ${closer}`
                )
                .setTimestamp();

            const attachment = new AttachmentBuilder(
                Buffer.from(transcript, 'utf-8'),
                { name: `transcript-${interaction.channel.name}.txt` }
            );

            await transcriptChannel.send({ embeds: [transcriptEmbed], files: [attachment] });

            closeInitiators.delete(closeKey);
            await deleteTicketData(interaction.channel.id);

            const closeEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setDescription('✅ Ticket closed. Transcript saved. Deleting channel in 3 seconds...');
            await interaction.editReply({ embeds: [closeEmbed] });

            setTimeout(async () => {
                await interaction.channel.delete().catch(console.error);
            }, 3000);

        } catch (error) {
            console.error('Error closing ticket:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription('❌ An error occurred while closing the ticket.');
            await interaction.editReply({ embeds: [embed] }).catch(() => {});
        }
    }
});

client.on('error', (error) => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error('❌ DISCORD_TOKEN is not set in the .env file!');
    process.exit(1);
}

client.login(token);
