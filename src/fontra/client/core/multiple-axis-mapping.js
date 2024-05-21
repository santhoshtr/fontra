// avar-2-style Multiple Axis Mapping

import { zip } from "./utils.js";
import {
  VariationModel,
  makeSparseNormalizedLocation,
  mapAxesFromUserSpaceToSourceSpace,
  normalizeLocation,
  unnormalizeLocation,
} from "./var-model.js";

export class MultipleAxisMapping {
  constructor(fontAxes, mappings) {
    this.fontAxesSourceSpace = mapAxesFromUserSpaceToSourceSpace(fontAxes);
    this.mappings = mappings;
    this._setupModel();
  }

  _setupModel() {
    const axisNames = this.fontAxesSourceSpace.map((axis) => axis.name);
    const inputLocations = [];
    const outputLocations = [];

    for (const { inputLocation, outputLocation } of this.mappings) {
      inputLocations.push(
        makeSparseNormalizedLocation(
          normalizeLocation(inputLocation, this.fontAxesSourceSpace)
        )
      );
      outputLocations.push(
        makeSparseNormalizedLocation(
          normalizeLocation(outputLocation, this.fontAxesSourceSpace)
        )
      );
    }

    // If base-master is missing, insert it at zero location.
    if (!inputLocations.some((loc) => Object.values(loc).every((v) => v === 0))) {
      inputLocations.splice(0, 0, {});
      outputLocations.splice(0, 0, {});
    }

    this.model = new VariationModel(inputLocations, axisNames);
    this.deltas = {};

    for (const axisName of axisNames) {
      const sourceValues = [];

      for (const [vo, vi] of zip(outputLocations, inputLocations)) {
        const v = vo[axisName];
        if (v === undefined) {
          sourceValues.push(0);
          continue;
        }
        sourceValues.push(v - (vi[axisName] || 0));
      }

      this.deltas[axisName] = this.model.getDeltas(sourceValues);
    }
  }

  mapLocation(sourceLocation) {
    const normalizedLocation = normalizeLocation(
      sourceLocation,
      this.fontAxesSourceSpace
    );

    const mappedLocation = this._mapNormalizedLocation(normalizedLocation);

    return unnormalizeLocation(mappedLocation, this.fontAxesSourceSpace);
  }

  _mapNormalizedLocation(location) {
    const mappedLocation = {};

    for (const [axisName, axisValue] of Object.entries(location)) {
      if (!(axisName in this.deltas)) {
        continue;
      }
      const value = this.model.interpolateFromDeltas(location, this.deltas[axisName]);

      mappedLocation[axisName] = axisValue + value;
    }

    return mappedLocation;
  }
}
