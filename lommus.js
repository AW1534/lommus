import { createRequire } from 'module';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import config from './config.json' with { type: 'json' };

import * as dotenv from 'dotenv';
dotenv.config({ quiet: true });
import { ActivityType, Client, EmbedBuilder, Events, GatewayIntentBits, MessageFlags, Partials } from 'discord.js';

console.log("LoMMuS is initializing...");

class LoMMuS {
	/**
	 * The client class instantiated and cached
	 * @type {Client}
	 */
	client = new Client({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMembers,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.GuildModeration,
			GatewayIntentBits.GuildMessageReactions,
			GatewayIntentBits.MessageContent,
			GatewayIntentBits.DirectMessages,
		],
		partials: [
			Partials.Message,
			Partials.Channel,
			Partials.Reaction,
		],
	});

	/**
	 * Has the client finished doing module loading?
	 *
	 * @type {boolean}
	 */
	_isModuleLoadingDone = false;

	/**
	 * Array of module names that have been loaded and registered
	 *
	 * @type {string[]}
	 */
	registeredModules = [];

	/**
	 * Cache color configuration here + TS assertions
	 * @constant
	 */
	colors = {
		RED: /** @type {`#${string}`} */ (config.red),
		GREEN: /** @type {`#${string}`} */ (config.green)
	};

	/**
	 * Initializes LoMMuS and logs in
	 * @param {string} token
	 */
	constructor (token) {
		console.log("Instantiating LoMMuS...");
		this.setupBot();
		this.setupSlashCommands();
		this.client.login(token);
	}

	/** Restarts the bot */
	restart() {
		spawn(process.argv0, process.argv.slice(1), {
			detached: true,   // don’t detach from the parent
			stdio: ['ignore', process.stdout, process.stderr],  // keep terminal connection
		}).unref();

		process.exit(0);
	}

	/**
	 * Loads ES-style modules from the `./modules` directory
	 */
	loadESModules() {
		console.log("Initializing ES module loading...");

		const moduleFiles = fs.readdirSync('./modules').filter(file => file.endsWith('.mjs'));

		for (const file of moduleFiles) {
			const module = import(`./modules/${file}`);

			module.then((module) => {
				try {
					/** @type {InstanceType<typeof import('./modules/util/module.mjs').BotModule>} */
					const instantiatedModule = new module.default();

					instantiatedModule.init(this.client);
					this.#checkLoadedModules(instantiatedModule.name);
					console.log(`'${instantiatedModule.name}' module loaded`);
				} catch (error) {
					if (error instanceof Error && error.message.includes("undefined is not a constructor (evaluating 'new module.default')")) console.warn('Ignoring \'' + file + '\' as it is not an initializable ES module');
				}
			});
		}
	}

	/**
	 * Checks all of the modules that have been loaded
	 *
	 * @param {string} moduleName The name of the module
	 */
	#checkLoadedModules(moduleName) {
		if (!this.registeredModules.includes(moduleName)) this.registeredModules.push((moduleName));
	}

	/**
	 * Sets up initial authentication and bot
	 * logic, including CJS module loading
	 */
	setupBot() {
		// Fires when bot successfully authenticates via token
		this.client.once(Events.ClientReady, async () => {
			// Get guild from client in order to set initial activity status
			const guild = this.client.guilds.cache.get(config.guildId);

			if (!this.client.user) {
				console.error("client.user not defined! Did the authentication fail?");
				return;
			}
			if (!guild) {
				console.error("guild is not defined! Is the bot joined to any server?");
				return;
			}

			console.log(`Ready! Logged in as ${this.client.user.tag}`);

			this.client.user.setActivity(`${guild.memberCount} LeMMingS`, { type: ActivityType.Watching });

			// This needs to be called here so that the guild data cache isn't stale
			this.loadESModules();
		});
		console.log("Initial bot setup done!");
	}

	/**
	 * Sets up slash command logic
	 */
	setupSlashCommands() {
		// Fires once for each slash command sent by users
		this.client.on(Events.InteractionCreate, async (interaction) => {
			if (!interaction || !interaction.channel || !interaction.guild) {
				console.error("Interaction is not configured correctly! Has slash commands been registered yet?");
				return;
			}

			// Screen bad command interactions
			if (!interaction.isChatInputCommand()) return;

			// Restart bot
			if (interaction.commandName === 'restart') {
				console.log("Restarting...");
				const embed = new EmbedBuilder()
					.setAuthor({ name: 'Restarting', iconURL: interaction.guild.iconURL({ size: 64 }) ?? "" })
					.setColor(this.colors.RED)
					.setDescription('Bot is restarting. Please wait a few seconds for the bot to reload everything');

				await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral })
					.then(async () => {
						this.restart();
					})
					.catch(error => {
						throw new Error(`Unable to restart properly! ${error}`);
					});
			}

			// Chat as bot
			if (interaction.commandName === 'say') {
				const msg = interaction.options.getString('message') ?? "";

				interaction.reply({ content: 'Message said', flags: MessageFlags.Ephemeral });
				// @ts-ignore
				await interaction.channel.send({ content: msg });
			}

			// Toggle various global booleans
			if (interaction.commandName === 'toggle') {
				const toggleType = interaction.options.getString('function');
				// Color randomization toggle
				if (toggleType === 'toggle_color') {
					// flip
					// TODO: ESM-ize these global vars
					globalThis.colorRandom = !globalThis.colorRandom;

					const embed = new EmbedBuilder()
						.setColor(this.colors.RED)
						.setDescription('Color randomization disabled.');
					// TODO: ESM-ize this global var
					if (globalThis.colorRandom) {
						embed.setColor(this.colors.GREEN);
						embed.setDescription('Color randomization enabled.');
					}
					await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
				}
			}
		});
		console.log("Slash command setup done!");
	}
}

// generic error handling
process.on('unhandledRejection', (error) => console.error('Uncaught Promise rejection:\n', error));

// final token check
export const LOMMUS = (process.env.TOKEN) ? new LoMMuS(process.env.TOKEN) : console.error("Token not found in env!");
