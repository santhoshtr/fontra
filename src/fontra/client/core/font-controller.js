import { applyChange, baseChangeFunctions } from "./changes.js";
import { VariableGlyphController } from "./glyph-controller.js";
import { LRUCache } from "./lru-cache.js";
import { VariableGlyph } from "./var-glyph.js";
import { mapForward, normalizeLocation } from "./var-model.js";
import { throttleCalls } from "./utils.js";


export class FontController {

  constructor (font, location) {
    this.font = font;
    this.location = location;
    this._glyphsPromiseCache = new LRUCache(250);  // TODO: what if we need to display > 250 glyphs?
    this.glyphUsedBy = {};  // Loaded glyphs only: this is for updating the scene
    this.glyphMadeOf = {};
    // Helper to throttle calls to changeChanging. (Ideally the minTime should
    // be dynamic and based on network and server load.)
    this.throttledChangeChanging = throttleCalls(
      (change) => this.font.changeChanging(change),
      50,
    );
    this.ensureInitialized = new Promise((resolve, reject) => {
      this._resolveInitialized = resolve;
    });
  }

  async initialize() {
    this.reverseCmap = await this.font.getReverseCmap();
    this.cmap = makeCmapFromReverseCmap(this.reverseCmap);
    this.globalAxes = await this.font.getGlobalAxes();
    this._resolveInitialized();
  }

  codePointForGlyph(glyphName) {
    const reverseCmap = this.reverseCmap;
    const cmap = this.cmap;
    for (const codePoint of reverseCmap[glyphName] || []) {
      if (cmap[codePoint] === glyphName) {
        return codePoint;
      }
    }
    return undefined;
  }

  async hasGlyph(glyphName) {
    return glyphName in this.reverseCmap;
  }

  getGlyph(glyphName) {
    let glyphPromise = this._glyphsPromiseCache.get(glyphName);
    if (glyphPromise === undefined) {
      glyphPromise = (async () => {
        if (!await this.hasGlyph(glyphName)) {
          return null;
        }
        let glyph = await this.font.getGlyph(glyphName);
        if (glyph !== null) {
          glyph = VariableGlyph.fromObject(glyph);
          glyph = new VariableGlyphController(glyph, this.globalAxes);
          this.updateGlyphDependencies(glyph);
        }
        return glyph;
      })();
      const purgedGlyphName = this._glyphsPromiseCache.put(glyphName, glyphPromise);
      // if (purgedGlyphName) {
      //   console.log("purging", purgedGlyphName);
      //   this.font.unloadGlyph(purgedGlyphName);
      // }
      // console.log("LRU size", this._glyphsPromiseCache.map.size);
    }
    return glyphPromise;
  }

  updateGlyphDependencies(glyph) {
    const glyphName = glyph.name;
    // Zap previous used-by data for this glyph, if any
    for (const componentName of this.glyphMadeOf[glyphName] || []) {
      if (this.glyphUsedBy[componentName]) {
        this.glyphUsedBy[componentName].delete(glyphName);
      }
    }
    const componentNames = glyph.getAllComponentNames();
    this.glyphMadeOf[glyphName] = componentNames;
    for (const componentName of componentNames) {
      if (!this.glyphUsedBy[componentName]) {
        this.glyphUsedBy[componentName] = new Set();
      }
      this.glyphUsedBy[componentName].add(glyphName);
    }
  }

  get location() {
    return this._location;
  }

  set location(location) {
    this._location = location;
    this._glyphInstancePromiseCache = {};
    this._loadedGlyphInstances = {};
  }

  async glyphChanged(glyphName) {
    delete this._glyphInstancePromiseCache[glyphName];
    delete this._loadedGlyphInstances[glyphName];
    for (const dependantName of this.glyphUsedBy[glyphName] || []) {
      await this.glyphChanged(dependantName);
    }
    const varGlyph = await this.getGlyph(glyphName);
    varGlyph.clearDeltasCache();
  }

  isGlyphInstanceLoaded(glyphName) {
    return glyphName in this._loadedGlyphInstances;
  }

  getGlyphInstance(glyphName) {
    let glyphInstancePromise = this._glyphInstancePromiseCache[glyphName];
    if (glyphInstancePromise === undefined) {
      glyphInstancePromise = (async () => {
        if (!await this.hasGlyph(glyphName)) {
          return null;
        }
        const varGlyph = await this.getGlyph(glyphName);
        const getGlyphFunc = this.getGlyph.bind(this);
        const instanceController = await varGlyph.instantiateController(this.location, getGlyphFunc);
        this._loadedGlyphInstances[glyphName] = true;
        return instanceController;
      })();
      this._glyphInstancePromiseCache[glyphName] = glyphInstancePromise;
    }
    return glyphInstancePromise;
  }

  async getSourceIndex(glyphName) {
    const glyph = await this.getGlyph(glyphName);
    return glyph.getSourceIndex(this.location);
  }

  async subscribeLiveGlyphChanges(glyphNames) {
    this.font.subscribeLiveGlyphChanges(glyphNames);
  }

  async changeBegin() {
    this.font.changeBegin();  // no await!
    // await this.font.changeBegin();
  }

  async changeSetRollback(rollbackChange) {
    this.font.changeSetRollback(rollbackChange);  // no await!
  }

  async changeChanging(change) {
    this.throttledChangeChanging(change);
  }

  async changeEnd(finalChange) {
    return await this.font.changeEnd(finalChange);
  }

  async applyChange(change) {
    if (change.p[0] === "glyphs") {
      const glyphName = change.p[1];
      const glyphSet = {};
      const root = {"glyphs": glyphSet};
      glyphSet[glyphName] = (await this.getGlyph(glyphName)).glyph;
      applyChange(root, change, glyphChangeFunctions);
      this.glyphChanged(glyphName);
    }
  }

  *iterGlyphMadeOf(glyphName) {
    for (const dependantGlyphName of this.glyphMadeOf[glyphName] || []) {
      yield dependantGlyphName;
      for (const deeperGlyphName of this.iterGlyphMadeOf(dependantGlyphName)) {
        yield deeperGlyphName;
      }
    }
  }

  *iterGlyphUsedBy(glyphName) {
    for (const dependantGlyphName of this.glyphUsedBy[glyphName] || []) {
      yield dependantGlyphName;
      for (const deeperGlyphName of this.iterGlyphUsedBy(dependantGlyphName)) {
        yield deeperGlyphName;
      }
    }
  }

  _purgeGlyphCache(glyphName) {
    this._glyphsPromiseCache.delete(glyphName);
    delete this._glyphInstancePromiseCache[glyphName];
    delete this._loadedGlyphInstances[glyphName];
    for (const dependantName of this.glyphUsedBy[glyphName] || []) {
      this._purgeGlyphCache(dependantName);
    }
  }

  async reloadGlyphs(glyphNames) {
    for (const glyphName of glyphNames) {
      this._purgeGlyphCache(glyphName);
    }
  }

}


function findClosestSourceIndexFromLocation(glyph, location) {
  const axisDict = {};
  for (const axis of glyph.axes) {
    axisDict[axis.name] = [axis.minValue, axis.defaultValue, axis.maxValue];
  }
  location = normalizeLocation(location, axisDict);
  const distances = [];
  for (let i = 0; i < glyph.sources.length; i++) {
    const sourceLocation = normalizeLocation(glyph.sources[i].location, axisDict);
    let distanceSquared = 0;
    for (const [axisName, value] of Object.entries(location)) {
      const sourceValue = sourceLocation[axisName];
      distanceSquared += (sourceValue - value) ** 2;
    }
    distances.push([distanceSquared, i]);
    if (distanceSquared === 0) {
      // exact match, no need to look further
      break;
    }
  }
  distances.sort((a, b) => {
    const da = a[0];
    const db = b[0];
    return (a > b) - (a < b);
  });
  return {distance: Math.sqrt(distances[0][0]), index: distances[0][1]}
}


function makeCmapFromReverseCmap(reverseCmap) {
  const cmap = {};
  for (const [glyphName, codePoints] of Object.entries(reverseCmap)) {
    for (const codePoint of codePoints) {
      const mappedGlyphName = cmap[codePoint];
      if (mappedGlyphName !== undefined && glyphName > mappedGlyphName) {
        continue;
      }
      cmap[codePoint] = glyphName;
    }
  }
  return cmap;
}


export const glyphChangeFunctions = {
  "=xy": (path, pointIndex, x, y) => path.setPointPosition(pointIndex, x, y),
  ...baseChangeFunctions,
};