import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  Editor,
  TextComponent,
  RequestParam,
  request,
} from "obsidian";

import wtf from 'wtf_wikipedia'

interface FandomExtract {
  title: string;
  text: string;
  url: string;
}

interface FandomPluginSettings {
  template: string;
  shouldUseParagraphTemplate: boolean;
  shouldBoldSearchTerm: boolean;
  shouldLinkCategories: boolean,
  paragraphTemplate: string;
  language: string;
  wiki: string,
}

const DEFAULT_SETTINGS: FandomPluginSettings = {
  template: `{{text}}\n> [Fandom]({{url}})`,
  shouldUseParagraphTemplate: true,
  shouldBoldSearchTerm: true,
  shouldLinkCategories: false,
  paragraphTemplate: `> {{paragraphText}}\n>\n`,
  language: "en",
  wiki: "",
};

const extractApiUrl = "fandom.com/api.php?action=query&prop=revisions&rvslots=*&rvprop=content&format=json&formatversion=2&titles=";

const disambiguationIdentifier = "may refer to:";
export default class FandomPlugin extends Plugin {
  settings: FandomPluginSettings;

  getWikis(): string[] {
    return [this.settings.wiki] || [];
  }

  getLanguage(): string {
    return this.settings.language ? this.settings.language : "en";
  }

  getUrl(wiki: string, title: string): string {
    return `https://${wiki}.fandom.com/wiki/${encodeURI(
      title
    )}`;
  }

  getApiUrl(wiki: string): string {
    return `https://${wiki}.` + extractApiUrl;
  }

  formatExtractText(extract: FandomExtract, searchTerm: string): string {
    const content = wtf(extract.text);
    const json: { [categories: string]: any } = content.json();
    const text: string = content.text();
    let formattedText: string = "";

    if (this.settings.shouldUseParagraphTemplate) {
      const split = text.split("==")[0].trim().split("\n");
      formattedText = split
        .map((paragraph) =>
          this.settings.paragraphTemplate.replace(
            "{{paragraphText}}",
            paragraph
          )
        )
        .join("")
        .trim();
    } else {
      formattedText = text.split("==")[0].trim();
    }
    if (this.settings.shouldBoldSearchTerm) {
      const pattern = new RegExp(searchTerm, "i");
      formattedText = formattedText.replace(pattern, `**${searchTerm}**`);
    }
    if (this.settings.shouldLinkCategories) {
            formattedText = formattedText.replace("{{categories}}", json.categories.map((category: any) => `[[${category}]]`).join(", "))
    }
    return formattedText;
  }

  handleNotFound(searchTerm: string) {
    new Notice(`${searchTerm} not found on Fandom.`);
  }

  handleCouldntResolveDisambiguation() {
    new Notice(`Could not automatically resolve disambiguation.`);
  }

  hasDisambiguation(extract: FandomExtract) {
    if (extract.text.includes(disambiguationIdentifier)) {
      return true;
    }
    return false;
  }

  parseResponse(wiki: string, json: any): FandomExtract | undefined {
        if (!json) return undefined;

const page = json.query.pages[0]

    if (!page)  {
            return undefined;
    }

    const content = page.revisions[0].slots.main.content;

      return {
        title:page.title,
        text: content,
        url: this.getUrl(wiki, page.title),
      };
  }

  formatExtractInsert(extract: FandomExtract, searchTerm: string): string {
    const formattedText = this.formatExtractText(extract, searchTerm);
    const template = this.settings.template;
    const formattedTemplate = template
      .replace("{{text}}", formattedText)
      .replace("{{searchTerm}}", searchTerm)
      .replace("{{url}}", extract.url);
    return formattedTemplate;
  }

  async getFandomText(title: string): Promise<FandomExtract | undefined> {
          let wikis: string[] = this.getWikis();
          let results = await Promise.all(wikis.map(wiki => {
                  return this.getFandomTextForWiki(wiki, title)
          }));

          return results.find(value => !!value);
  }

  async getFandomTextForWiki(wiki: string, title: string): Promise<FandomExtract | undefined> {
              if (!wiki) {
              new Notice(
                      `A Wiki has not been set. Please set your Fandom Wikis in the settings.`
              )
                      return undefined;
              }

          const url = this.getApiUrl(wiki) + encodeURIComponent(title);
    const requestParam: RequestParam = {
      url: url,
    };

    const resp = await request(requestParam)
      .then((r) => JSON.parse(r))
      .catch((err: Error) => {
              console.error(err);
              new Notice(
                      `Failed to get Fandom. Check your internet connection or verify if wiki prefix "${wiki}" is correct.`
              )
              return undefined;
      });
    return this.parseResponse(wiki, resp);
  }

  async pasteIntoEditor(editor: Editor, searchTerm: string) {
    let extract: FandomExtract = await this.getFandomText(searchTerm);
    if (!extract) {
      this.handleNotFound(searchTerm);
      return;
    }
    if (this.hasDisambiguation(extract)) {
      new Notice(
        `Disambiguation found for ${searchTerm}. Choosing first result.`
      );
      const newSearchTerm = extract.text
        .split(disambiguationIdentifier)[1]
        .trim()
        .split(",")[0]
        .split("==")
        .pop()
        .trim();
      extract = await this.getFandomText(newSearchTerm);
      if (!extract) {
        this.handleCouldntResolveDisambiguation();
        return;
      }
    }
    editor.replaceSelection(this.formatExtractInsert(extract, searchTerm));
  }

  async getFandomTextForActiveFile(editor: Editor) {
    const activeFile = await this.app.workspace.getActiveFile();
    if (activeFile) {
      const searchTerm = activeFile.basename;
      if (searchTerm) {
        await this.pasteIntoEditor(editor, searchTerm);
      }
    }
  }

  async getFandomTextForSearchTerm(editor: Editor) {
    new FandomSearchModal(this.app, this, editor).open();
  }

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "fandom-get-active-note-title",
      name: "Get Fandom for Active Note Title",
      editorCallback: (editor: Editor) =>
        this.getFandomTextForActiveFile(editor),
    });

    this.addCommand({
      id: "fandom-get-search-term",
      name: "Get Fandom for Search Term",
      editorCallback: (editor: Editor) =>
        this.getFandomTextForSearchTerm(editor),
    });

    this.addSettingTab(new FandomSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class FandomSearchModal extends Modal {
  searchTerm: string;
  plugin: FandomPlugin;
  editor: Editor;

  constructor(app: App, plugin: FandomPlugin, editor: Editor) {
    super(app);
    this.plugin = plugin;
    this.editor = editor;
  }

  onOpen() {
    let { contentEl } = this;

    contentEl.createEl("h2", { text: "Enter Search Term:" });

    const inputs = contentEl.createDiv("inputs");
    const searchInput = new TextComponent(inputs).onChange((searchTerm) => {
      this.searchTerm = searchTerm;
    });
    searchInput.inputEl.focus();
    searchInput.inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        this.close();
      }
    });

    const controls = contentEl.createDiv("controls");
    const searchButton = controls.createEl("button", {
      text: "Search",
      cls: "mod-cta",
      attr: {
        autofocus: true,
      },
    });
    searchButton.addEventListener("click", this.close.bind(this));
    const cancelButton = controls.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", this.close.bind(this));
  }

  async onClose() {
    let { contentEl } = this;

    contentEl.empty();
    if (this.searchTerm) {
      await this.plugin.pasteIntoEditor(this.editor, this.searchTerm);
    }
  }
}

class FandomSettingTab extends PluginSettingTab {
  plugin: FandomPlugin;

  constructor(app: App, plugin: FandomPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;

    containerEl.empty();

    containerEl.createEl("h2", { text: "Obsidian Fandom" });

    new Setting(containerEl)
      .setName("Fandom Wiki Prefix")
      .setDesc(`Choose Fandom wiki prefix to use (ex. starwars for Star Wars)`)
      .addText((textField) => {
        textField
          .setValue(this.plugin.settings.wiki)
          .onChange(async (value) => {
            this.plugin.settings.wiki = value
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Fandom Extract Template")
      .setDesc(
        `Set markdown template for extract to be inserted.\n
        Available template variables are {{text}}, {{searchTerm}} and {{url}}.
        `
      )
      .addTextArea((textarea) =>
        textarea
          .setValue(this.plugin.settings.template)
          .onChange(async (value) => {
            this.plugin.settings.template = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Link Categories?")
      .setDesc(
        "If set to true, links will be created from the categories of the article."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.shouldLinkCategories)
          .onChange(async (value) => {
            this.plugin.settings.shouldLinkCategories = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Bold Search Term?")
      .setDesc(
        "If set to true, the first instance of the search term will be **bolded**"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.shouldBoldSearchTerm)
          .onChange(async (value) => {
            this.plugin.settings.shouldBoldSearchTerm = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Use paragraph template?")
      .setDesc(
        "If set to true, the paragraph template will be inserted for each paragraph of text for {{text}} in main template."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.shouldUseParagraphTemplate)
          .onChange(async (value) => {
            this.plugin.settings.shouldUseParagraphTemplate = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Paragraph Template")
      .setDesc(
        `Set markdown template for extract paragraphs to be inserted.\n
        Available template variables are: {{paragraphText}}
        `
      )
      .addTextArea((textarea) =>
        textarea
          .setValue(this.plugin.settings.paragraphTemplate)
          .onChange(async (value) => {
            this.plugin.settings.paragraphTemplate = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
