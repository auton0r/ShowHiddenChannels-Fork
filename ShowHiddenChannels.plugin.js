/**
 * @name ShowHiddenChannels
 * @author DevilBro
 * @authorId 278543574059057154
 * @version 2.9.9
 * @description Displays all hidden Channels, which can't be accessed due to Role Restrictions, this won't allow you to read them (impossible)
 * @invite Jx3TjNS
 * @donate https://www.paypal.me/MircoWittrien
 * @patreon https://www.patreon.com/MircoWittrien
 * @website https://mwittrien.github.io/
 * @source https://github.com/mwittrien/BetterDiscordAddons/tree/master/Plugins/ShowHiddenChannels/
 * @updateUrl https://mwittrien.github.io/BetterDiscordAddons/Plugins/ShowHiddenChannels/ShowHiddenChannels.plugin.js
 */

module.exports = (_ => {
	const config = {
		"info": {
			"name": "ShowHiddenChannels",
			"author": "DevilBro",
			"version": "2.9.9",
			"description": "Displays all hidden Channels, which can't be accessed due to Role Restrictions, this won't allow you to read them (impossible)"
		}
	};

	return !window.BDFDB_Global || (!window.BDFDB_Global.loaded && !window.BDFDB_Global.started) ? class {
		getName () {return config.info.name;}
		getAuthor () {return config.info.author;}
		getVersion () {return config.info.version;}
		getDescription () {return `The Library Plugin needed for ${config.info.name} is missing. Open the Plugin Settings to download it. \n\n${config.info.description}`;}

		downloadLibrary () {
			require("request").get("https://mwittrien.github.io/BetterDiscordAddons/Library/0BDFDB.plugin.js", (e, r, b) => {
				if (!e && b && r.statusCode == 200) require("fs").writeFile(require("path").join(BdApi.Plugins.folder, "0BDFDB.plugin.js"), b, _ => BdApi.showToast("Finished downloading BDFDB Library", {type: "success"}));
				else BdApi.alert("Error", "Could not download BDFDB Library Plugin. Try again later or download it manually from GitHub: https://mwittrien.github.io/downloader/?library");
			});
		}

		load () {
			if (!window.BDFDB_Global || !Array.isArray(window.BDFDB_Global.pluginQueue)) window.BDFDB_Global = Object.assign({}, window.BDFDB_Global, {pluginQueue: []});
			if (!window.BDFDB_Global.downloadModal) {
				window.BDFDB_Global.downloadModal = true;
				BdApi.showConfirmationModal("Library Missing", `The Library Plugin needed for ${config.info.name} is missing. Please click "Download Now" to install it.`, {
					confirmText: "Download Now",
					cancelText: "Cancel",
					onCancel: _ => {delete window.BDFDB_Global.downloadModal;},
					onConfirm: _ => {
						delete window.BDFDB_Global.downloadModal;
						this.downloadLibrary();
					}
				});
			}
			if (!window.BDFDB_Global.pluginQueue.includes(config.info.name)) window.BDFDB_Global.pluginQueue.push(config.info.name);
		}
		start () {this.load();}
		stop () {}
		getSettingsPanel () {
			let template = document.createElement("template");
			template.innerHTML = `<div style="color: var(--header-primary); font-size: 16px; font-weight: 300; white-space: pre; line-height: 22px;">The Library Plugin needed for ${config.info.name} is missing.\nPlease click <a style="font-weight: 500;">Download Now</a> to install it.</div>`;
			template.content.firstElementChild.querySelector("a").addEventListener("click", this.downloadLibrary);
			return template.content.firstElementChild;
		}
	} : (([Plugin, BDFDB]) => {
		var blackList = [], collapseList = [], hiddenCategory, lastGuildId, overrideTypes = [];
		var hiddenChannelCache = {};
    var accessModal;

    const {Patcher, DiscordModules, WebpackModules, PluginUtilities, Toasts, ReactTools, DiscordClasses, DiscordSelectors, Utilities, DOMTools, ColorConverter, ReactComponents, DCM} = ZLibrary;

		const channelGroupMap = {
			GUILD_TEXT: "SELECTABLE",
			GUILD_VOICE: "VOCAL",
			GUILD_ANNOUNCEMENT: "SELECTABLE",
			GUILD_STORE: "SELECTABLE",
		};

		const typeNameMap = {
			GUILD_TEXT: "TEXT_CHANNEL",
			GUILD_VOICE: "VOICE_CHANNEL",
			GUILD_ANNOUNCEMENT: "NEWS_CHANNEL",
			GUILD_STORE: "STORE_CHANNEL",
			GUILD_CATEGORY: "CATEGORY",
			GUILD_STAGE_VOICE: "STAGE_CHANNEL"
		};

		const UserRowComponent = class UserRow extends BdApi.React.Component {
			componentDidMount() {
				if (this.props.user.fetchable) {
					this.props.user.fetchable = false;
					BDFDB.LibraryModules.UserFetchUtils.getUser(this.props.user.id).then(fetchedUser => {
						this.props.user = Object.assign({}, fetchedUser, BDFDB.LibraryModules.MemberStore.getMember(this.props.guildId, this.props.user.id) || {});
						BDFDB.ReactUtils.forceUpdate(this);
					});
				}
			}
			render() {
				return BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ListRow, {
					prefix: BDFDB.ReactUtils.createElement("div", {
						className: BDFDB.disCN.listavatar,
						children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.AvatarComponents.default, {
							src: BDFDB.UserUtils.getAvatar(this.props.user.id),
							status: BDFDB.UserUtils.getStatus(this.props.user.id),
							size: BDFDB.LibraryComponents.AvatarComponents.Sizes.SIZE_40,
							onClick: _ => {
								if (accessModal) accessModal.props.onClose();
								BDFDB.LibraryModules.UserProfileModalUtils.openUserProfileModal({
									userId: this.props.user.id,
									guildId: this.props.guildId
								});
							}
						})
					}),
					labelClassName: BDFDB.disCN.nametag,
					label: [
						BDFDB.ReactUtils.createElement("span", {
							className: BDFDB.disCN.username,
							children: this.props.user.username,
							style: {color: this.props.user.colorString}
						}),
						!this.props.user.discriminator ? null : BDFDB.ReactUtils.createElement("span", {
							className: BDFDB.disCN.listdiscriminator,
							children: `#${this.props.user.discriminator}`
						}),
						this.props.user.bot && BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.BotTag, {
							style: {marginLeft: 6}
						})
					]
				});
			}
		};

		const RoleRowComponent = class RoleRow extends BdApi.React.Component {
			render() {
				return BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ListRow, {
					prefix: BDFDB.ReactUtils.createElement("div", {
						className: BDFDB.disCNS.avataricon + BDFDB.disCNS.listavatar + BDFDB.disCNS.avatariconsizemedium + BDFDB.disCN.avatariconinactive,
						style: {
							boxSizing: "border-box",
							padding: 10
						},
						children: BDFDB.ReactUtils.createElement("div", {
							style: {
								borderRadius: "50%",
								height: "100%",
								width: "100%",
								backgroundColor: BDFDB.ColorUtils.convert(this.props.role.colorString || BDFDB.DiscordConstants.Colors.PRIMARY_DARK_300, "RGB")
							}
						})
					}),
					labelClassName: this.props.role.overwritten && BDFDB.disCN.strikethrough,
					label: BDFDB.ReactUtils.createElement("span", {
						children: this.props.role.name,
						style: {color: this.props.role.colorString}
					})
				});
			}
    };

    const escapeHTML = DOMTools.escapeHTML ? DOMTools.escapeHTML : function(html) {
      const textNode = document.createTextNode("");
      const spanElement = document.createElement("span");
      spanElement.append(textNode);
      textNode.nodeValue = html;
      return spanElement.innerHTML;
  };

		return class ShowHiddenChannels extends Plugin {
			onLoad () {
				overrideTypes = Object.keys(BDFDB.DiscordConstants.PermissionOverrideType);

				this.defaults = {
					general: {
						sortNative:				{value: true, 	description: "Sort hidden Channels in the native Order instead of an extra Category"},
						showVoiceUsers:			{value: true, 	description: "Show connected Users in hidden Voice Channels"},
						alwaysCollapse:			{value: false, 	description: "Always collapse 'Hidden' Category after switching Servers"},
						showForNormal:			{value: true,	description: "Add Access-Overview ContextMenu Entry for non-hidden Channels"}
					},
					channels: {
						GUILD_TEXT:				{value: true},
						GUILD_VOICE:			{value: true},
						GUILD_ANNOUNCEMENT:		{value: true},
						GUILD_STORE:			{value: true},
						GUILD_STAGE_VOICE:		{value: true}
					}
				};

				this.patchedModules = {
					before: {
						Channels: "render",
						ChannelCategoryItem: "type",
						VoiceUsers: "render"
					},
					after: {
						ChannelItem: "default"
					}
				};

				this.css = `
					${BDFDB.dotCNS._showhiddenchannelsaccessmodal + BDFDB.dotCN.messagespopoutemptyplaceholder} {
						position: absolute;
						bottom: 0;
						width: 100%;
					}

          .member-perms-header {
            display: flex;
            justify-content: space-between;
        }

        .member-perms {
            display: flex;
            flex-wrap: wrap;
            margin-top: 2px;
            max-height: 160px;
            overflow-y: auto;
            overflow-x: hidden;
        }

        .member-perms .member-perm .perm-circle {
            border-radius: 50%;
            height: 12px;
            margin-right: 4px;
            width: 12px;
        }

        .member-perms .member-perm .name {
            margin-right: 4px;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .perm-details-button {
            cursor: pointer;
            height: 12px;
        }

        .perm-details {
            display: flex;
            justify-content: flex-end;
        }

        .member-perm-details {
            cursor: pointer;
        }

        .member-perm-details-button {
            fill: #72767d;
            height: 10px;
        }

        /* Modal */

        @keyframes permissions-backdrop {
            to { opacity: 0.85; }
        }

        @keyframes perms-modal-wrapper {
            to { transform: scale(1); opacity: 1; }
        }

        @keyframes permissions-backdrop-closing {
            to { opacity: 0; }
        }

        @keyframes perms-modal-wrapper-closing {
            to { transform: scale(0.7); opacity: 0; }
        }

        #perms-modal-wrapper {
            z-index: 100;
        }

        #perms-modal-wrapper .callout-backdrop {
            animation: permissions-backdrop 250ms ease;
            animation-fill-mode: forwards;
            opacity: 0;
            background-color: rgb(0, 0, 0);
            transform: translateZ(0px);
        }

        #perms-modal-wrapper.closing .callout-backdrop {
            animation: permissions-backdrop-closing 200ms linear;
            animation-fill-mode: forwards;
            animation-delay: 50ms;
            opacity: 0.85;
        }

        #perms-modal-wrapper.closing .modal-wrapper {
            animation: perms-modal-wrapper-closing 250ms cubic-bezier(0.19, 1, 0.22, 1);
            animation-fill-mode: forwards;
            opacity: 1;
            transform: scale(1);
        }

        #perms-modal-wrapper .modal-wrapper {
            animation: perms-modal-wrapper 250ms cubic-bezier(0.175, 0.885, 0.32, 1.275);
            animation-fill-mode: forwards;
            transform: scale(0.7);
            transform-origin: 50% 50%;
            display: flex;
            align-items: center;
            box-sizing: border-box;
            contain: content;
            justify-content: center;
            top: 0;
            left: 0;
            bottom: 0;
            right: 0;
            opacity: 0;
            pointer-events: none;
            position: absolute;
            user-select: none;
            z-index: 1000;
        }

        #perms-modal-wrapper .modal-body {
            background-color: #36393f;
            height: 440px;
            width: auto;
            /*box-shadow: 0 0 0 1px rgba(32,34,37,.6), 0 2px 10px 0 rgba(0,0,0,.2);*/
            flex-direction: row;
            overflow: hidden;
            display: flex;
            flex: 1;
            contain: layout;
            position: relative;
        }

        #perms-modal-wrapper #perms-modal {
            display: flex;
            contain: layout;
            flex-direction: column;
            pointer-events: auto;
            border: 1px solid rgba(28,36,43,.6);
            border-radius: 5px;
            box-shadow: 0 2px 10px 0 rgba(0,0,0,.2);
            overflow: hidden;
        }

        #perms-modal-wrapper .header {
            background-color: #35393e;
            box-shadow: 0 2px 3px 0 rgba(0,0,0,.2);
            padding: 12px 20px;
            z-index: 1;
            color: #fff;
            font-size: 16px;
            font-weight: 700;
            line-height: 19px;
        }

        .role-side, .perm-side {
            flex-direction: column;
            padding-left: 6px;
        }

        .role-scroller, .perm-scroller {
            contain: layout;
            flex: 1;
            min-height: 1px;
            overflow-y: scroll;
        }

        #perms-modal-wrapper .scroller-title {
            color: #fff;
            padding: 8px 0 4px 4px;
            margin-right: 8px;
            border-bottom: 1px solid rgba(0,0,0,0.3);
            display: none;
        }

        #perms-modal-wrapper .role-side {
            width: auto;
            min-width: 150px;
            background: #2f3136;
            flex: 0 0 auto;
            overflow: hidden;
            display: flex;
            height: 100%;
            min-height: 1px;
            position: relative;
        }

        #perms-modal-wrapper .role-scroller {
            contain: layout;
            flex: 1;
            min-height: 1px;
            overflow-y: scroll;
            padding-top: 8px;
        }

        #perms-modal-wrapper .role-item {
            display: flex;
            border-radius: 2px;
            padding: 6px;
            margin-bottom: 5px;
            cursor: pointer;
            color: #dcddde;
        }

        #perms-modal-wrapper .role-item:hover {
            background-color: rgba(0,0,0,0.1);
        }

        #perms-modal-wrapper .role-item.selected {
            background-color: rgba(0,0,0,0.2);
        }

        #perms-modal-wrapper .perm-side {
            width: 250px;
            background-color: #36393f;
            flex: 0 0 auto;
            display: flex;
            height: 100%;
            min-height: 1px;
            position: relative;
            padding-left: 10px;
        }

        #perms-modal-wrapper .perm-item {
            box-shadow: inset 0 -1px 0 rgba(79,84,92,.3);
            box-sizing: border-box;
            height: 44px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            flex-direction: row;
            justify-content: flex-start;
            align-items: center;
            display: flex;
        }

        #perms-modal-wrapper .perm-item.allowed svg {
            fill: #43B581;
        }

        #perms-modal-wrapper .perm-item.denied svg {
            fill: #F04747;
        }

        #perms-modal-wrapper .perm-name {
            display: inline;
            flex: 1;
            font-size: 16px;
            font-weight: 400;
            overflow: hidden;
            text-overflow: ellipsis;
            user-select: text;
            color: #dcddde;
            margin-left: 10px;
        }


        .member-perms::-webkit-scrollbar-thumb, .member-perms::-webkit-scrollbar-track,
        #perms-modal-wrapper *::-webkit-scrollbar-thumb, #perms-modal-wrapper *::-webkit-scrollbar-track {
            background-clip: padding-box;
            border-radius: 7.5px;
            border-style: solid;
            border-width: 3px;
            visibility: hidden;
        }

        .member-perms:hover::-webkit-scrollbar-thumb, .member-perms:hover::-webkit-scrollbar-track,
        #perms-modal-wrapper *:hover::-webkit-scrollbar-thumb, #perms-modal-wrapper *:hover::-webkit-scrollbar-track {
            visibility: visible;
        }

        .member-perms::-webkit-scrollbar-track,
        #perms-modal-wrapper *::-webkit-scrollbar-track {
            border-width: initial;
            background-color: transparent;
            border: 2px solid transparent;
        }

        .member-perms::-webkit-scrollbar-thumb,
        #perms-modal-wrapper *::-webkit-scrollbar-thumb {
            border: 2px solid transparent;
            border-radius: 4px;
            cursor: move;
            background-color: rgba(32,34,37,.6);
        }

        .member-perms::-webkit-scrollbar,
        #perms-modal-wrapper *::-webkit-scrollbar {
            height: 8px;
            width: 8px;
        }



        .theme-light #perms-modal-wrapper #perms-modal {
            background: #fff;
        }

        .theme-light #perms-modal-wrapper .modal-body {
            background: transparent;
        }

        .theme-light #perms-modal-wrapper .header {
            background: transparent;
            color: #000;
        }

        .theme-light #perms-modal-wrapper .role-side {
            background: rgba(0,0,0,.2);
        }

        .theme-light #perms-modal-wrapper .perm-side {
            background: rgba(0,0,0,.1);
        }

        .theme-light #perms-modal-wrapper .role-item,
        .theme-light #perms-modal-wrapper .perm-name {
            color: #000;
        }`;

        this.listHTML = `<div id="perms-popout">
        <div class="member-perms-header \${bodyTitle}">
        <div class="member-perms-title">\${label}</div>
        <span class="perm-details">
            <svg name="Details" viewBox="0 0 24 24" class="perm-details-button" fill="currentColor">
                <path d="M0 0h24v24H0z" fill="none"/>
                <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
            </svg>
        </span>
    </div>
    <ul class="member-perms \${root} \${rolesList} \${endBodySection}"></ul>
</div>`;
            this.itemHTML = `<li class="member-perm \${role}">
        <div class="perm-circle \${roleCircle}"></div>
        <div class="name \${roleName}"></div>
    </li>`;
            this.modalHTML = `<div id="perms-modal-wrapper">
        <div class="callout-backdrop \${backdrop}"></div>
        <div class="modal-wrapper \${modal}">
            <div id="perms-modal" class="\${inner}">
                <div class="header"><div class="title">\${header}</div></div>
                <div class="modal-body">
                    <div class="role-side">
                        <span class="scroller-title role-list-title">\${rolesLabel}</span>
                        <div class="role-scroller">

                        </div>
                    </div>
                    <div class="perm-side">
                        <span class="scroller-title perm-list-title">\${permissionsLabel}</span>
                        <div class="perm-scroller">

                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    this.listHTML = Utilities.formatTString(this.listHTML, DiscordClasses.UserPopout);
    this.listHTML = Utilities.formatTString(this.listHTML, DiscordClasses.PopoutRoles);
    this.itemHTML = Utilities.formatTString(this.itemHTML, DiscordClasses.PopoutRoles);
    this.modalHTML = Utilities.formatTString(this.modalHTML, DiscordClasses.Backdrop);
    this.modalHTML = Utilities.formatTString(this.modalHTML, DiscordClasses.Modals);

        this.modalItem = `<div class="perm-item"><span class="perm-name"></span></div>`;
        this.modalButton = `<div class="role-item"><span class="role-name"></span></div>`;
        this.modalButtonUser = `<div class="role-item"><div class="wrapper-2F3Zv8 xsmall-3afG_L"><div class="image-33JSyf xsmall-3afG_L" style="background-image: url('\${avatarUrl}');"></div></div><span class="role-name marginLeft8-1YseBe"></span></div>`;
        this.permAllowedIcon = `<svg height="24" viewBox="0 0 24 24" width="24"><path d="M0 0h24v24H0z" fill="none"/><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
        this.permDeniedIcon = `<svg height="24" viewBox="0 0 24 24" width="24"><path d="M0 0h24v24H0z" fill="none"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/></svg>`;

        this.AvatarDefaults = WebpackModules.getByProps("DEFAULT_AVATARS");

        this.DiscordPerms = Object.assign({}, BDFDB.DiscordConstants.Permissions);
        if (this.DiscordPerms.STREAM) {
          this.DiscordPerms.VIDEO = this.DiscordPerms.STREAM;
          delete this.DiscordPerms.STREAM;
        }
        if (this.DiscordPerms.MANAGE_GUILD) {
          this.DiscordPerms.MANAGE_SERVER = this.DiscordPerms.MANAGE_GUILD;
            delete this.DiscordPerms.MANAGE_GUILD;
        }
			}

			onStart () {
				let loadedBlackList = BDFDB.DataUtils.load(this, "blacklist");
				this.saveBlackList(!BDFDB.ArrayUtils.is(loadedBlackList) ? [] : loadedBlackList);

				let loadedCollapseList = BDFDB.DataUtils.load(this, "categorydata");
				this.saveCollapseList(!BDFDB.ArrayUtils.is(loadedCollapseList) ? [] : loadedCollapseList);

				BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.UnreadChannelUtils, "hasUnread", {after: e => {
					return e.returnValue && !this.isChannelHidden(e.methodArguments[0]);
				}});

				BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.UnreadChannelUtils, "getMentionCount", {after: e => {
					return this.isChannelHidden(e.methodArguments[0]) ? 0 : e.returnValue;
				}});

				BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.CategoryCollapseStore, "isCollapsed", {after: e => {
					if (e.methodArguments[0] && e.methodArguments[0].endsWith("hidden")) {
						if (this.settings.general.alwaysCollapse && e.methodArguments[0] != lastGuildId && !collapseList.includes(e.methodArguments[0])) {
							collapseList.push(e.methodArguments[0]);
							this.saveCollapseList(BDFDB.ArrayUtils.removeCopies(collapseList));
						}
						lastGuildId = e.methodArguments[0];
						return collapseList.includes(e.methodArguments[0]);
					}
				}});

				BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.CategoryCollapseUtils, "categoryCollapse", {before: e => {
					if (e.methodArguments[0] && e.methodArguments[0].endsWith("hidden")) {
						if (!collapseList.includes(e.methodArguments[0])) {
							collapseList.push(e.methodArguments[0]);
							this.saveCollapseList(BDFDB.ArrayUtils.removeCopies(collapseList));
						}
					}
				}});

				BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.CategoryCollapseUtils, "categoryExpand", {before: e => {
					if (e.methodArguments[0] && e.methodArguments[0].endsWith("hidden")) {
						if (collapseList.includes(e.methodArguments[0])) {
							BDFDB.ArrayUtils.remove(collapseList, e.methodArguments[0], true);
							this.saveCollapseList(BDFDB.ArrayUtils.removeCopies(collapseList));
						}
					}
				}});

				BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.GuildChannelStore, "getTextChannelNameDisambiguations", {after: e => {
					let all = this.getAllChannels();
					for (let channel_id in all) if (all[channel_id].guild_id == e.methodArguments[0] && !e.returnValue[channel_id] && (all[channel_id].type != BDFDB.DiscordConstants.ChannelTypes.GUILD_CATEGORY && all[channel_id].type != BDFDB.DiscordConstants.ChannelTypes.GUILD_VOICE)) e.returnValue[channel_id] = {id: channel_id, name: all[channel_id].name};
				}});

				BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.ChannelIconUtils, "getChannelIconComponent", {before: e => {
					if (e.methodArguments[2] && e.methodArguments[2].locked && e.methodArguments[0] && this.isChannelHidden(e.methodArguments[0].id)) e.methodArguments[2].locked = false;
				}});

				this.forceUpdateAll();
			}

			onStop () {
				this.forceUpdateAll();
			}

			getSettingsPanel (collapseStates = {}) {
				let settingsPanel;
				return settingsPanel = BDFDB.PluginUtils.createSettingsPanel(this, {
					collapseStates: collapseStates,
					children: _ => {
						let settingsItems = [];

						settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
							title: "Settings",
							collapseStates: collapseStates,
							children: Object.keys(this.defaults.general).map(key => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsSaveItem, {
								type: "Switch",
								plugin: this,
								keys: ["general", key],
								label: this.defaults.general[key].description,
								value: this.settings.general[key]
							})).concat(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsPanelList, {
								title: "Show Channels:",
								children: Object.keys(this.defaults.channels).map(key => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsSaveItem, {
									type: "Switch",
									plugin: this,
									keys: ["channels", key],
									label: BDFDB.LanguageUtils.LanguageStrings[typeNameMap[key]],
									value: this.settings.channels[key]
								}))
							}))
						}));

						settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
							title: "Server Black List",
							collapseStates: collapseStates,
							children: [
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsGuildList, {
									className: BDFDB.disCN.marginbottom20,
									disabled: blackList,
									onClick: disabledGuilds => this.saveBlackList(disabledGuilds)
								}),
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
									type: "Button",
									color: BDFDB.LibraryComponents.Button.Colors.GREEN,
									label: "Enable for all Servers",
									onClick: _ => this.batchSetGuilds(settingsPanel, collapseStates, true),
									children: BDFDB.LanguageUtils.LanguageStrings.ENABLE
								}),
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
									type: "Button",
									color: BDFDB.LibraryComponents.Button.Colors.PRIMARY,
									label: "Disable for all Servers",
									onClick: _ => this.batchSetGuilds(settingsPanel, collapseStates, false),
									children: BDFDB.LanguageUtils.LanguageStrings.DISABLE
								})
							]
						}));

						return settingsItems;
					}
				});
			}

			onSettingsClosed () {
				if (this.SettingsUpdated) {
					delete this.SettingsUpdated;
					this.forceUpdateAll();
				}
			}

			forceUpdateAll () {
				hiddenChannelCache = {};

				BDFDB.PatchUtils.forceAllUpdates(this);
				BDFDB.ChannelUtils.rerenderAll();
      }

      showModal(modal) {
        const popout = document.querySelector(DiscordSelectors.UserPopout.userPopout);
        if (popout) popout.style.display = "none";
        const app = document.querySelector(".app-19_DXt");
        if (app) app.append(modal);
        else document.querySelector("#app-mount").append(modal);
      }

      createModalChannel(name, channel, guild) {
        return this.createModal(`#${name}`, channel.permissionOverwrites, guild.roles, true);
      }

      createModal(title, displayRoles, referenceRoles, isOverride = false) {
        if (!referenceRoles) referenceRoles = displayRoles;

        const st = {
          header: "${name}'s Permissions",
          rolesLabel: "Roles",
          permissionsLabel: "Permissions",
          owner: "@owner"
        }

        const modal = DOMTools.createElement(Utilities.formatTString(Utilities.formatTString(this.modalHTML, st), {name: escapeHTML(title)}));

        modal.querySelector(".callout-backdrop").addEventListener("click", () => {
            modal.classList.add("closing");
            setTimeout(() => {modal.remove();}, 300);
        });

        const strings = DiscordModules.Strings;
        for (const r in displayRoles) {
            const role = Array.isArray(displayRoles) ? displayRoles[r] : r;
            const user = BDFDB.LibraryModules.UserStore.getUser(role) || {avatarURL: this.AvatarDefaults.DEFAULT_AVATARS[Math.floor(Math.random() * this.AvatarDefaults.DEFAULT_AVATARS.length)], username: role};
            const member = BDFDB.LibraryModules.MemberStore.getMember(DiscordModules.SelectedGuildStore.getGuildId(), role) || {colorString: ""};
            const item = DOMTools.createElement(!isOverride || displayRoles[role].type == 0 ? this.modalButton : Utilities.formatTString(this.modalButtonUser, {avatarUrl: user.avatarURL}));
            if (!isOverride || displayRoles[role].type == 0) item.style.color = referenceRoles[role].colorString;
            else item.style.color = member.colorString;
            if (isOverride) item.querySelector(".role-name").innerHTML = escapeHTML(displayRoles[role].type == 0 ? referenceRoles[role].name : user.username);
            else item.querySelector(".role-name").innerHTML = escapeHTML(referenceRoles[role].name);
            modal.querySelector(".role-scroller").append(item);
            item.addEventListener("click", () => {
                modal.querySelectorAll(".role-item.selected").forEach(e => e.removeClass("selected"));
                item.classList.add("selected");
                let allowed = isOverride ? displayRoles[role].allow : referenceRoles[role].permissions;
                const denied = isOverride ? displayRoles[role].deny : null;

                if (!allowed.data) allowed = {data: BigInt(allowed)};

                const permList = modal.querySelector(".perm-scroller");
                permList.innerHTML = "";
                for (const perm in this.DiscordPerms) {
                    const element = DOMTools.createElement(this.modalItem);
                    const permAllowed = (allowed.data & this.DiscordPerms[perm].data) == this.DiscordPerms[perm].data;
                    const permDenied = isOverride ? (denied.data & this.DiscordPerms[perm].data) == this.DiscordPerms[perm].data : !permAllowed;
                    if (!permAllowed && !permDenied) continue;
                    if (permAllowed) {
                        element.classList.add("allowed");
                        element.prepend(DOMTools.createElement(this.permAllowedIcon));
                    }
                    if (permDenied) {
                        element.classList.add("denied");
                        element.prepend(DOMTools.createElement(this.permDeniedIcon));
                    }
                    element.querySelector(".perm-name").textContent = strings[perm] || perm.split("_").map(n => n[0].toUpperCase() + n.slice(1).toLowerCase()).join(" ");
                    permList.append(element);
                }
            });
            item.addEventListener("contextmenu", (e) => {
                DCM.openContextMenu(e, DCM.buildMenu([
                    {label: DiscordModules.Strings.COPY_ID, action: () => {DiscordModules.ElectronModule.copy(role);}}
                ]));
            });
        }

        modal.querySelector(".role-item").click();

        return modal;
    }

      onChannelContextMenu(e) {
        // Permissions viewer
				if (e.instance.props.channel) {
					if (e.instance.props.channel.id.endsWith("hidden") && e.instance.props.channel.type == BDFDB.DiscordConstants.ChannelTypes.GUILD_CATEGORY) {
						let [children, index] = BDFDB.ReactUtils.findParent(e.returnvalue, {name: "ChannelMuteItem"});
						if (index > -1) children.splice(index, 1);
					}
					let isHidden = this.isChannelHidden(e.instance.props.channel.id);
					if (isHidden || this.settings.general.showForNormal) {
						let [children, index] = BDFDB.ContextMenuUtils.findItem(e.returnvalue, {id: "mark-channel-read", group: true});
						children.splice(index > -1 ? index + 1 : 0, 0, BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuGroup, {
							children: BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuItem, {
								label: BDFDB.LanguageUtils.LanguageStrings.PERMISSIONS,
								id: BDFDB.ContextMenuUtils.createItemId(this.name, "channelPermissions"),
                action: () => {
                  const channel = e.instance.props.channel;
                  if (!Object.keys(channel.permissionOverwrites).length) return Toasts.info(`#${channel.name} has no permission overrides`);
                  this.showModal(this.createModalChannel(channel.name, channel, e.instance.props.guild));
                }
                //action: _ => this.openAccessModal(e.instance.props.channel, !isHidden)
							})
						}));
					}
        }

        // Channel Viewer
        if (e.instance.props.channel) {
					if (e.instance.props.channel.id.endsWith("hidden") && e.instance.props.channel.type == BDFDB.DiscordConstants.ChannelTypes.GUILD_CATEGORY) {
						let [children, index] = BDFDB.ReactUtils.findParent(e.returnvalue, {name: "ChannelMuteItem"});
						if (index > -1) children.splice(index, 1);
					}
					let isHidden = this.isChannelHidden(e.instance.props.channel.id);
					if (isHidden || this.settings.general.showForNormal) {
						let [children, index] = BDFDB.ContextMenuUtils.findItem(e.returnvalue, {id: "mark-channel-read", group: true});
						children.splice(index > -1 ? index + 1 : 0, 0, BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuGroup, {
							children: BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuItem, {
								label: BDFDB.LanguageUtils.LanguageStrings.CHANNEL + " " + BDFDB.LanguageUtils.LanguageStrings.ACCESSIBILITY,
								id: BDFDB.ContextMenuUtils.createItemId(this.name, "channelAccessibility"),
                action: _ => this.openAccessModal(e.instance.props.channel, !isHidden)
							})
						}));
					}
				}
			}

			onGuildContextMenu (e) {
				if (e.instance.props.guild) {
					let [children, index] = BDFDB.ContextMenuUtils.findItem(e.returnvalue, {id: "hide-muted-channels"});
					if (index > -1) children.splice(index + 1, 0, BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuCheckboxItem, {
						label: this.labels.context_hidehidden,
						id: BDFDB.ContextMenuUtils.createItemId(this.name, "hide-locked-channels"),
						checked: blackList.includes(e.instance.props.guild.id),
						action: value => {
							if (value) blackList.push(e.instance.props.guild.id);
							else BDFDB.ArrayUtils.remove(blackList, e.instance.props.guild.id, true);
							this.saveBlackList(BDFDB.ArrayUtils.removeCopies(blackList));

							BDFDB.PatchUtils.forceAllUpdates(this);
							BDFDB.ChannelUtils.rerenderAll(true);
						}
					}));
				}
			}

			onGuildHeaderContextMenu (e) {
				this.onGuildContextMenu(e);
			}

			processChannels (e) {
				if (!e.instance.props.guild || blackList.includes(e.instance.props.guild.id)) return;
				let [hiddenChannels, amount] = this.getHiddenChannels(e.instance.props.guild);
				if (amount) {
					e.instance.props.categories = Object.assign({}, e.instance.props.categories);
					for (let catId in e.instance.props.categories) e.instance.props.categories[catId] = [].concat(e.instance.props.categories[catId]);
					e.instance.props.channels = Object.assign({}, e.instance.props.channels);
					for (let type in e.instance.props.channels) e.instance.props.channels[type] = [].concat(e.instance.props.channels[type]);

					let hiddenId = e.instance.props.guild.id + "_hidden";

					delete e.instance.props.categories[hiddenId];
					e.instance.props.categories._categories = e.instance.props.categories._categories.filter(n => n.channel.id != hiddenId);
					e.instance.props.channels[BDFDB.DiscordConstants.ChannelTypes.GUILD_CATEGORY] = e.instance.props.channels[BDFDB.DiscordConstants.ChannelTypes.GUILD_CATEGORY].filter(n => n.channel.id != hiddenId);

					let index = -1;
					for (let catId in e.instance.props.categories) {
						if (catId != "_categories") e.instance.props.categories[catId] = e.instance.props.categories[catId].filter(n => !this.isChannelHidden(n.channel.id));
						for (let channelObj of e.instance.props.categories[catId]) if (channelObj.index > index) index = parseInt(channelObj.index);
					}
					if (!this.settings.general.sortNative) {
						hiddenCategory = new BDFDB.DiscordObjects.Channel({
							guild_id: e.instance.props.guild.id,
							id: hiddenId,
							name: "hidden",
							type: BDFDB.DiscordConstants.ChannelTypes.GUILD_CATEGORY
						});
						e.instance.props.categories[hiddenId] = [];
						e.instance.props.categories._categories.push({
							channel: hiddenCategory,
							index: ++index
						});
						e.instance.props.channels[BDFDB.DiscordConstants.ChannelTypes.GUILD_CATEGORY].push({
							comparator: (e.instance.props.channels[BDFDB.DiscordConstants.ChannelTypes.GUILD_CATEGORY][e.instance.props.channels[BDFDB.DiscordConstants.ChannelTypes.GUILD_CATEGORY].length - 1] || {comparator: 0}).comparator + 1,
							channel: hiddenCategory
						});
					}
					else hiddenCategory = null;

					for (let type in hiddenChannels) {
						let channelType = channelGroupMap[BDFDB.DiscordConstants.ChannelTypes[type]] || type;
						if (!BDFDB.ArrayUtils.is(e.instance.props.channels[channelType])) e.instance.props.channels[channelType] = [];
						for (let channel of hiddenChannels[type]) {
							let hiddenChannel = new BDFDB.DiscordObjects.Channel(Object.assign({}, channel, {
								parent_id: hiddenCategory ? hiddenId : channel.parent_id
							}));
							let parent_id = hiddenChannel.parent_id || "null";
							e.instance.props.categories[parent_id].push({
								channel: hiddenChannel,
								index: hiddenChannel.position
							});
							e.instance.props.channels[channelType].push({
								comparator: hiddenChannel.position,
								channel: hiddenChannel
							});
						}
					}

					for (let parent_id in e.instance.props.categories) BDFDB.ArrayUtils.keySort(e.instance.props.categories[parent_id], "index");
					for (let channelType in e.instance.props.channels) BDFDB.ArrayUtils.keySort(e.instance.props.channels[channelType], "comparator");
				}
			}

			processChannelCategoryItem (e) {
				if (hiddenCategory && e.instance.props.channel && !e.instance.props.channel.id && e.instance.props.channel.type != BDFDB.DiscordConstants.ChannelTypes.GUILD_CATEGORY) e.instance.props.channel = hiddenCategory;
			}

			processChannelItem (e) {
				if (e.instance.props.channel && this.isChannelHidden(e.instance.props.channel.id)) {
					let [children, index] = BDFDB.ReactUtils.findParent(e.returnvalue, {name: "ChannelItemIcon"});
					let channelChildren = BDFDB.ReactUtils.findChild(e.returnvalue, {props: [["className", BDFDB.disCN.channelchildren]]});
					if (channelChildren && channelChildren.props && channelChildren.props.children) {
						channelChildren.props.children = [BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TooltipContainer, {
							text: BDFDB.LanguageUtils.LanguageStrings.CHANNEL_LOCKED_SHORT,
							children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Clickable, {
								className: BDFDB.disCN.channeliconitem,
								style: {display: "block"},
								children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
									className: BDFDB.disCN.channelactionicon,
									name: BDFDB.LibraryComponents.SvgIcon.Names.LOCK_CLOSED
								})
							})
						})];
					}
					if (!(e.instance.props.channel.type == BDFDB.DiscordConstants.ChannelTypes.GUILD_VOICE && e.instance.props.connected)) {
						let wrapper = BDFDB.ReactUtils.findChild(e.returnvalue, {props: [["className", BDFDB.disCN.channelwrapper]]});
						if (wrapper) {
							wrapper.props.onMouseDown = _ => {};
							wrapper.props.onMouseUp = _ => {};
						}
						let mainContent = BDFDB.ReactUtils.findChild(e.returnvalue, {props: [["className", BDFDB.disCN.channelmaincontent]]});
						if (mainContent) {
							mainContent.props.onClick = _ => {};
							mainContent.props.href = null;
						}
					}
				}
			}

			processVoiceUsers (e) {
				if (!this.settings.general.showVoiceUsers && this.isChannelHidden(e.instance.props.channel.id)) e.instance.props.voiceStates = [];
			}

			isChannelHidden (channelId) {
				let channel = BDFDB.LibraryModules.ChannelStore.getChannel(channelId);
				return channel && hiddenChannelCache[channel.guild_id] && hiddenChannelCache[channel.guild_id].hidden[channel.type] && hiddenChannelCache[channel.guild_id].hidden[channel.type].find(c => c.id == channel.id);
			}

			getAllChannels () {
				return (BDFDB.LibraryModules.ChannelStore.getGuildChannels || BDFDB.LibraryModules.ChannelStore.getMutableGuildChannels || (_ => ({})))();
			}

			getHiddenChannels (guild) {
				if (!guild) return [{}, 0];
				let hiddenChannels = {}, visibleAmount = (BDFDB.LibraryModules.GuildChannelStore.getChannels(guild.id) || {count: 0}),count, rolesAmount = (BDFDB.LibraryModules.MemberStore.getMember(guild.id, BDFDB.UserUtils.me.id) || {roles: []}).roles.length;
				if (!hiddenChannelCache[guild.id] || hiddenChannelCache[guild.id].visible != visibleAmount || hiddenChannelCache[guild.id].roles != rolesAmount) {
					let all = this.getAllChannels();
					for (let type in BDFDB.DiscordConstants.ChannelTypes) hiddenChannels[BDFDB.DiscordConstants.ChannelTypes[type]] = [];
					for (let channel_id in all) {
						let channel = all[channel_id];
						if (channel.guild_id == guild.id && channel.type != BDFDB.DiscordConstants.ChannelTypes.GUILD_CATEGORY && (this.settings.channels[BDFDB.DiscordConstants.ChannelTypes[channel.type]] || this.settings.channels[BDFDB.DiscordConstants.ChannelTypes[channel.type]] === undefined) && !BDFDB.DMUtils.isDMChannel(channel.id) && !BDFDB.UserUtils.can("VIEW_CHANNEL", BDFDB.UserUtils.me.id, channel.id)) hiddenChannels[channel.type].push(channel);
					}
				}
				else hiddenChannels = hiddenChannelCache[guild.id].hidden;
				for (let type in hiddenChannels) hiddenChannels[type] = hiddenChannels[type].filter(c => BDFDB.LibraryModules.ChannelStore.getChannel(c.id));
				hiddenChannelCache[guild.id] = {hidden: hiddenChannels, amount: BDFDB.ObjectUtils.toArray(hiddenChannels).flat().length, visible: visibleAmount, roles: rolesAmount};
				return [hiddenChannelCache[guild.id].hidden, hiddenChannelCache[guild.id].amount];
			}

			batchSetGuilds (settingsPanel, collapseStates, value) {
				if (!value) {
					for (let id of BDFDB.LibraryModules.FolderStore.getFlattenedGuildIds()) blackList.push(id);
					this.saveBlackList(BDFDB.ArrayUtils.removeCopies(blackList));
				}
				else this.saveBlackList([]);
				BDFDB.PluginUtils.refreshSettingsPanel(this, settingsPanel, collapseStates);
			}

			saveBlackList (savedBlackList) {
				blackList = savedBlackList;
				BDFDB.DataUtils.save(savedBlackList, this, "blacklist");
			}

			saveCollapseList (savedCollapseList) {
				collapseList = savedCollapseList;
				BDFDB.DataUtils.save(savedCollapseList, this, "categorydata");
			}

			openAccessModal (channel, allowed) {
				let guild = BDFDB.LibraryModules.GuildStore.getGuild(channel.guild_id);
				let myMember = guild && BDFDB.LibraryModules.MemberStore.getMember(guild.id, BDFDB.UserUtils.me.id);
				let category = BDFDB.LibraryModules.ChannelStore.getChannel(BDFDB.LibraryModules.ChannelStore.getChannel(channel.id).parent_id);
				let lightTheme = BDFDB.DiscordUtils.getTheme() == BDFDB.disCN.themelight;

				let addUser = (id, users) => {
					let user = BDFDB.LibraryModules.UserStore.getUser(id);
					if (user) allowedUsers.push(Object.assign({}, user, BDFDB.LibraryModules.MemberStore.getMember(guild.id, id) || {}));
					else users.push({id: id, username: `UserId: ${id}`, fetchable: true});
				};
				let checkPerm = permString => {
					return ((permString | BDFDB.DiscordConstants.Permissions.VIEW_CHANNEL) == permString || (permString | BDFDB.DiscordConstants.Permissions.READ_MESSAGE_HISTORY) == permString || channel.type == BDFDB.DiscordConstants.ChannelTypes.GUILD_VOICE && (permString | BDFDB.DiscordConstants.Permissions.CONNECT) == permString);
				};

				let allowedRoles = [], allowedUsers = [], deniedRoles = [], deniedUsers = [], everyoneDenied = false;
				for (let id in channel.permissionOverwrites) {
					if ((channel.permissionOverwrites[id].type == BDFDB.DiscordConstants.PermissionOverrideType.ROLE || overrideTypes[channel.permissionOverwrites[id].type] == BDFDB.DiscordConstants.PermissionOverrideType.ROLE) && (guild.roles[id] && guild.roles[id].name != "@everyone") && checkPerm(channel.permissionOverwrites[id].allow)) {
						allowedRoles.push(Object.assign({overwritten: myMember && myMember.roles.includes(id) && !allowed}, guild.roles[id]));
					}
					else if ((channel.permissionOverwrites[id].type == BDFDB.DiscordConstants.PermissionOverrideType.MEMBER || overrideTypes[channel.permissionOverwrites[id].type] == BDFDB.DiscordConstants.PermissionOverrideType.MEMBER) && checkPerm(channel.permissionOverwrites[id].allow)) {
						addUser(id, allowedUsers);
					}
					if ((channel.permissionOverwrites[id].type == BDFDB.DiscordConstants.PermissionOverrideType.ROLE || overrideTypes[channel.permissionOverwrites[id].type] == BDFDB.DiscordConstants.PermissionOverrideType.ROLE) && checkPerm(channel.permissionOverwrites[id].deny)) {
						deniedRoles.push(guild.roles[id]);
						if (guild.roles[id] && guild.roles[id].name == "@everyone") everyoneDenied = true;
					}
					else if ((channel.permissionOverwrites[id].type == BDFDB.DiscordConstants.PermissionOverrideType.MEMBER || overrideTypes[channel.permissionOverwrites[id].type] == BDFDB.DiscordConstants.PermissionOverrideType.MEMBER) && checkPerm(channel.permissionOverwrites[id].den)) {
						addUser(id, deniedUsers);
					}
				}

				if (![].concat(allowedUsers, deniedUsers).find(user => user.id == guild.ownerId)) addUser(guild.ownerId, allowedUsers);
				for (let id in guild.roles) if ((guild.roles[id].permissions | BDFDB.DiscordConstants.Permissions.ADMINISTRATOR) == guild.roles[id].permissions && ![].concat(allowedRoles, deniedRoles).find(role => role.id == id)) allowedRoles.push(Object.assign({overwritten: myMember && myMember.roles.includes(id) && !allowed}, guild.roles[id]));
				if (allowed && !everyoneDenied) allowedRoles.push({name: "@everyone"});

				let allowedElements = [], deniedElements = [];
				for (let role of allowedRoles) allowedElements.push(BDFDB.ReactUtils.createElement(RoleRowComponent, {role: role, guildId: guild.id, channelId: channel.id}));
				for (let user of allowedUsers) allowedElements.push(BDFDB.ReactUtils.createElement(UserRowComponent, {user: user, guildId: guild.id, channelId: channel.id}));
				for (let role of deniedRoles) deniedElements.push(BDFDB.ReactUtils.createElement(RoleRowComponent, {role: role, guildId: guild.id, channelId: channel.id}));
				for (let user of deniedUsers) deniedElements.push(BDFDB.ReactUtils.createElement(UserRowComponent, {user: user, guildId: guild.id, channelId: channel.id}));

				BDFDB.ModalUtils.open(this, {
					size: "MEDIUM",
					header: BDFDB.LanguageUtils.LanguageStrings.CHANNEL + " " + BDFDB.LanguageUtils.LanguageStrings.ACCESSIBILITY,
					subHeader: "#" + channel.name,
					className: BDFDB.disCN._showhiddenchannelsaccessmodal,
					contentClassName: BDFDB.disCN.listscroller,
					onOpen: modalInstance => {if (modalInstance) accessModal = modalInstance;},
					children: [
						BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ModalComponents.ModalTabContent, {
							className: BDFDB.disCN.modalsubinner,
							tab: BDFDB.LanguageUtils.LanguageStrings.OVERLAY_SETTINGS_GENERAL_TAB,
							children: [{
									title: BDFDB.LanguageUtils.LanguageStrings.FORM_LABEL_CHANNEL_NAME,
									text: channel.name
								}, channel.type == BDFDB.DiscordConstants.ChannelTypes.GUILD_VOICE ? {
									title: BDFDB.LanguageUtils.LanguageStrings.FORM_LABEL_BITRATE,
									text: channel.bitrate || "---"
								} : {
									title: BDFDB.LanguageUtils.LanguageStrings.FORM_LABEL_CHANNEL_TOPIC,
									text: BDFDB.ReactUtils.markdownParse(channel.topic || "---")
								}, {
									title: BDFDB.LanguageUtils.LanguageStrings.CHANNEL_TYPE,
									text: BDFDB.LanguageUtils.LanguageStrings[typeNameMap[BDFDB.DiscordConstants.ChannelTypes[channel.type]]]
								}, {
									title: BDFDB.LanguageUtils.LanguageStrings.CATEGORY_NAME,
									text: category && category.name || BDFDB.LanguageUtils.LanguageStrings.NO_CATEGORY
								}].map((formLabel, i) => formLabel && [
									i == 0 ? null : BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormComponents.FormDivider, {
										className: BDFDB.disCN.marginbottom20
									}),
									BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormComponents.FormItem, {
										title: `${formLabel.title}:`,
										className: BDFDB.DOMUtils.formatClassName(BDFDB.disCN.marginbottom20, i == 0 && BDFDB.disCN.margintop8),
										children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormComponents.FormText, {
											className: BDFDB.disCN.marginleft8,
											children: formLabel.text
										})
									})
								]).flat(10).filter(n => n)
						}),
						/*BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ModalComponents.ModalTabContent, {
							tab: this.labels.modal_allowed,
							children: allowedElements.length ? allowedElements :
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.MessagesPopoutComponents.EmptyStateBottom, {
									msg: BDFDB.LanguageUtils.LanguageStrings.AUTOCOMPLETE_NO_RESULTS_HEADER,
									image: lightTheme ? "/assets/9b0d90147f7fab54f00dd193fe7f85cd.svg" : "/assets/308e587f3a68412f137f7317206e92c2.svg"
								})
						}),
						BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ModalComponents.ModalTabContent, {
							tab: this.labels.modal_denied,
							children: deniedElements.length ? deniedElements :
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.MessagesPopoutComponents.EmptyStateBottom, {
									msg: BDFDB.LanguageUtils.LanguageStrings.AUTOCOMPLETE_NO_RESULTS_HEADER,
									image: lightTheme ? "/assets/9b0d90147f7fab54f00dd193fe7f85cd.svg" : "/assets/308e587f3a68412f137f7317206e92c2.svg"
								})
						})*/
					]
				});
			}

			setLabelsByLanguage () {
				switch (BDFDB.LanguageUtils.getLanguage().id) {
					case "bg":		// Bulgarian
						return {
							context_hidehidden:					"Скриване на заключените канали",
							modal_allowed:						"Разрешено",
							modal_denied:						"Отрича се"
						};
					case "da":		// Danish
						return {
							context_hidehidden:					"Skjul låste kanaler",
							modal_allowed:						"Tilladt",
							modal_denied:						"Nægtet"
						};
					case "de":		// German
						return {
							context_hidehidden:					"Versteckte Kanäle ausblenden",
							modal_allowed:						"Erlaubt",
							modal_denied:						"Verweigert"
						};
					case "el":		// Greek
						return {
							context_hidehidden:					"Απόκρυψη κλειδωμένων καναλιών",
							modal_allowed:						"Επιτρεπόμενο",
							modal_denied:						"Απορρίφθηκε"
						};
					case "es":		// Spanish
						return {
							context_hidehidden:					"Ocultar canales bloqueados",
							modal_allowed:						"Permitido",
							modal_denied:						"Negado"
						};
					case "fi":		// Finnish
						return {
							context_hidehidden:					"Piilota lukitut kanavat",
							modal_allowed:						"Sallittu",
							modal_denied:						"Kielletty"
						};
					case "fr":		// French
						return {
							context_hidehidden:					"Masquer les salons verrouillées",
							modal_allowed:						"Permis",
							modal_denied:						"Refusé"
						};
					case "hr":		// Croatian
						return {
							context_hidehidden:					"Sakrij zaključane kanale",
							modal_allowed:						"Dopuštena",
							modal_denied:						"Odbijen"
						};
					case "hu":		// Hungarian
						return {
							context_hidehidden:					"Zárt csatornák elrejtése",
							modal_allowed:						"Megengedett",
							modal_denied:						"Megtagadva"
						};
					case "it":		// Italian
						return {
							context_hidehidden:					"Nascondi canali bloccati",
							modal_allowed:						"Consentito",
							modal_denied:						"Negato"
						};
					case "ja":		// Japanese
						return {
							context_hidehidden:					"ロックされたチャンネルを非表示にする",
							modal_allowed:						"許可",
							modal_denied:						"拒否されました"
						};
					case "ko":		// Korean
						return {
							context_hidehidden:					"잠긴 채널 숨기기",
							modal_allowed:						"허용됨",
							modal_denied:						"거부 됨"
						};
					case "lt":		// Lithuanian
						return {
							context_hidehidden:					"Slėpti užrakintus kanalus",
							modal_allowed:						"Leidžiama",
							modal_denied:						"Paneigta"
						};
					case "nl":		// Dutch
						return {
							context_hidehidden:					"Verberg vergrendelde kanalen",
							modal_allowed:						"Toegestaan",
							modal_denied:						"Geweigerd"
						};
					case "no":		// Norwegian
						return {
							context_hidehidden:					"Skjul låste kanaler",
							modal_allowed:						"Tillatt",
							modal_denied:						"Nektet"
						};
					case "pl":		// Polish
						return {
							context_hidehidden:					"Ukryj zablokowane kanały",
							modal_allowed:						"Dozwolony",
							modal_denied:						"Odmówiono"
						};
					case "pt-BR":	// Portuguese (Brazil)
						return {
							context_hidehidden:					"Ocultar canais bloqueados",
							modal_allowed:						"Permitido",
							modal_denied:						"Negado"
						};
					case "ro":		// Romanian
						return {
							context_hidehidden:					"Ascundeți canalele blocate",
							modal_allowed:						"Permis",
							modal_denied:						"Negat"
						};
					case "ru":		// Russian
						return {
							context_hidehidden:					"Скрыть заблокированные каналы",
							modal_allowed:						"Разрешенный",
							modal_denied:						"Отказано"
						};
					case "sv":		// Swedish
						return {
							context_hidehidden:					"Dölj låsta kanaler",
							modal_allowed:						"Tillåtet",
							modal_denied:						"Förnekad"
						};
					case "th":		// Thai
						return {
							context_hidehidden:					"ซ่อนช่องที่ถูกล็อก",
							modal_allowed:						"ได้รับอนุญาต",
							modal_denied:						"ถูกปฏิเสธ"
						};
					case "tr":		// Turkish
						return {
							context_hidehidden:					"Kilitli Kanalları Gizle",
							modal_allowed:						"İzin veriliyor",
							modal_denied:						"Reddedildi"
						};
					case "uk":		// Ukrainian
						return {
							context_hidehidden:					"Сховати заблоковані канали",
							modal_allowed:						"Дозволено",
							modal_denied:						"Заперечується"
						};
					case "vi":		// Vietnamese
						return {
							context_hidehidden:					"Ẩn các kênh đã khóa",
							modal_allowed:						"Được phép",
							modal_denied:						"Phủ định"
						};
					case "zh-CN":	// Chinese (China)
						return {
							context_hidehidden:					"隐藏锁定的频道",
							modal_allowed:						"允许的",
							modal_denied:						"被拒绝"
						};
					case "zh-TW":	// Chinese (Taiwan)
						return {
							context_hidehidden:					"隱藏鎖定的頻道",
							modal_allowed:						"允許的",
							modal_denied:						"被拒絕"
						};
					default:		// English
						return {
							context_hidehidden:					"Hide Locked Channels",
							modal_allowed:						"Permitted",
							modal_denied:						"Denied"
						};
				}
			}
		};
	})(window.BDFDB_Global.PluginUtils.buildPlugin(config));
})();
