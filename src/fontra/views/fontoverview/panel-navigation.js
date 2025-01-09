import { groupByKeys, groupByProperties } from "/core/glyph-organizer.js";
import * as html from "/core/html-utils.js";
import { translate } from "/core/localization.js";
import { ObservableController } from "/core/observable-object.js";
import { labeledCheckbox } from "/core/ui-utils.js";
import { GlyphSearchField } from "/web-components/glyph-search-field.js";
import { Accordion } from "/web-components/ui-accordion.js";

export class FontOverviewNavigation extends HTMLElement {
  constructor(fontOverviewController) {
    super();

    this.fontController = fontOverviewController.fontController;
    this.fontOverviewSettingsController =
      fontOverviewController.fontOverviewSettingsController;
    this.fontOverviewSettings = this.fontOverviewSettingsController.model;

    this._setupUI();
  }

  async _setupUI() {
    this.fontSources = await this.fontController.getSources();

    this.fontSourceInput = html.select(
      {
        id: "font-source-select",
        style: "width: 100%;",
        onchange: (event) => {
          const fontSourceIdentifier = event.target.value;
          const sourceLocation = {
            ...this.fontSources[fontSourceIdentifier]?.location,
          }; // A font may not have any font sources, therefore the ?-check
          this.fontOverviewSettings.fontLocationSource = sourceLocation;
        },
      },
      []
    );

    for (const fontSourceIdentifier of this.fontController.getSortedSourceIdentifiers()) {
      const sourceName = this.fontSources[fontSourceIdentifier].name;
      this.fontSourceInput.appendChild(
        html.option({ value: fontSourceIdentifier }, [sourceName])
      );
    }

    this.fontOverviewSettingsController.addKeyListener("fontLocationSource", (event) =>
      this._updateFontSourceInput()
    );
    this._updateFontSourceInput();

    this.searchField = new GlyphSearchField({
      settingsController: this.fontOverviewSettingsController,
      searchStringKey: "searchString",
    });

    this.appendChild(this.searchField);

    const accordion = new Accordion();

    accordion.items = [
      {
        label: translate("sources.labels.location"),
        content: this.fontSourceInput,
        open: true,
      },
      {
        label: "Group by", // TODO: translate
        content: this._makeGroupByUI(),
        open: true,
      },
      {
        label: "Project glyph sets", // TODO: translate
        content: this._makeProjectGlyphSetsUI(),
        open: true,
      },
      {
        label: "My glyph sets", // TODO: translate
        content: this._makeMyGlyphSetsUI(),
        open: true,
      },
    ];

    this.appendChild(accordion);
  }

  _makeGroupByUI() {
    const checkboxController = makeCheckboxController(
      this.fontOverviewSettingsController,
      "groupByKeys"
    );

    return html.div({}, [
      ...groupByProperties.map(({ key, label }) =>
        labeledCheckbox(label, checkboxController, key)
      ),
    ]);
  }

  _makeProjectGlyphSetsUI() {
    const projectGlyphSets = [{ key: "__this_font__", label: "This font's glyph set" }];
    return this._makeGlyphSetsUI("projectGlyphSets", projectGlyphSets);
  }

  _makeMyGlyphSetsUI() {
    const myGlyphSets = [{ key: "floof", label: "Gloof" }];
    return this._makeGlyphSetsUI("myGlyphSets", myGlyphSets);
  }

  _makeGlyphSetsUI(settingsKey, glyphSets) {
    const checkboxController = makeCheckboxController(
      this.fontOverviewSettingsController,
      settingsKey
    );

    return html.div({}, [
      ...glyphSets.map(({ key, label }) =>
        labeledCheckbox(label, checkboxController, key)
      ),
    ]);
  }

  _updateFontSourceInput() {
    const fontSourceIdentifier =
      this.fontController.fontSourcesInstancer.getLocationIdentifierForLocation(
        this.fontOverviewSettings.fontLocationSource
      );
    for (const optionElement of this.fontSourceInput.children) {
      optionElement.selected = optionElement.value === fontSourceIdentifier;
    }
  }
}

customElements.define("font-overview-navigation", FontOverviewNavigation);

function makeCheckboxController(settingsController, settingsKey) {
  const settings = settingsController.model;

  const checkboxController = new ObservableController(
    Object.fromEntries(settings[settingsKey].map((key) => [key, true]))
  );

  checkboxController.addListener((event) => {
    if (!event.senderInfo?.sentFromSettings) {
      settings[settingsKey] = Object.entries(checkboxController.model)
        .filter(([key, value]) => value)
        .map(([key, value]) => key);
    }
  });

  settingsController.addKeyListener(settingsKey, (event) => {
    checkboxController.withSenderInfo({ sentFromSettings: true }, () => {
      Object.entries(checkboxController.model).forEach(([key, value]) => {
        checkboxController.model[key] = event.newValue.includes(key);
      });
    });
  });

  return checkboxController;
}
