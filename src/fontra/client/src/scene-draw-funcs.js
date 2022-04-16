import { union } from "./set-ops.js";
import { withSavedState } from "./utils.js";


export function drawMultiGlyphsLayer(model, controller) {
  _drawMultiGlyphsLayer(model, controller);
}


export function drawMultiGlyphsLayerClean(model, controller) {
  _drawMultiGlyphsLayer(model, controller, false);
}


function _drawMultiGlyphsLayer(model, controller, skipSelected = true) {
  if (!model.positionedLines) {
    return;
  }
  const context = controller.context;
  const selectedGlyph = model.getSelectedPositionedGlyph();
  context.fillStyle = controller.drawingParameters.glyphFillColor;
  for (const glyphLine of model.positionedLines) {
    for (const glyph of glyphLine.glyphs) {
      if (skipSelected && glyph === selectedGlyph && model.selectedGlyphIsEditing) {
        continue;
      }
      withSavedState(context, () => {
        context.translate(glyph.x, glyph.y);

        // context.fillStyle = "#CCC";
        // fillPolygon(context, glyph.glyph.convexHull);
        // context.fillStyle = controller.drawingParameters.glyphFillColor;

        context.fill(glyph.glyph.flattenedPath2d);
      });
    }
  }
}


export function drawSelectedBaselineLayer(model, controller) {
  if (!model.selectedGlyph || !model.selectedGlyphIsEditing) {
    return;
  }
  const context = controller.context;
  const positionedGlyph = model.getSelectedPositionedGlyph();
  context.translate(positionedGlyph.x, positionedGlyph.y);
  context.strokeStyle = controller.drawingParameters.handleColor;
  context.lineWidth = controller.drawingParameters.handleLineWidth;
  strokeLine(context, 0, 0, positionedGlyph.glyph.xAdvance, 0);
}


export function drawHoveredGlyphLayer(model, controller) {
  if (!model.hoveredGlyph || model.hoveredGlyph === model.selectedGlyph) {
    return;
  }
  _drawSelectedGlyphLayer(model, controller, model.hoveredGlyph, "hoveredGlyphStrokeColor");
}

export function drawSelectedGlyphLayer(model, controller) {
  if (!model.selectedGlyph || model.selectedGlyphIsEditing) {
    return;
  }
  _drawSelectedGlyphLayer(model, controller, model.selectedGlyph, "selectedGlyphStrokeColor");
}

function _drawSelectedGlyphLayer(model, controller, selectedGlyph, strokeColorName) {
  const context = controller.context;
  const [lineIndex, glyphIndex] = selectedGlyph.split("/");
  const positionedGlyph = model.positionedLines[lineIndex].glyphs[glyphIndex];

  context.translate(positionedGlyph.x, positionedGlyph.y);
  drawWithDoubleStroke(
    context,
    positionedGlyph.glyph.flattenedPath2d,
    10 * controller.onePixelUnit,
    3 * controller.onePixelUnit,
    controller.drawingParameters[strokeColorName],
    controller.drawingParameters.glyphFillColor,
  )
}


export function drawComponentsLayer(model, controller) {
  if (!model.selectedGlyph || !model.selectedGlyphIsEditing) {
    return;
  }
  const context = controller.context;
  const positionedGlyph = model.getSelectedPositionedGlyph();

  context.translate(positionedGlyph.x, positionedGlyph.y);

  // context.fillStyle = "#DDD";
  // for (const component of positionedGlyph.glyph.components) {
  //   fillPolygon(context, component.convexHull);
  // }

  context.fillStyle = controller.drawingParameters.componentFillColor;
  context.fill(positionedGlyph.glyph.componentsPath2d);
}


export function drawPathLayer(model, controller) {
  if (!model.selectedGlyph || !model.selectedGlyphIsEditing) {
    return;
  }
  const context = controller.context;
  const positionedGlyph = model.getSelectedPositionedGlyph();

  context.translate(positionedGlyph.x, positionedGlyph.y);
  context.lineWidth = controller.drawingParameters.pathLineWidth;
  context.strokeStyle = controller.drawingParameters.pathStrokeColor;
  context.stroke(positionedGlyph.glyph.path2d);
}


export function drawHandlesLayer(model, controller) {
  if (!model.selectedGlyph || !model.selectedGlyphIsEditing) {
    return;
  }
  const context = controller.context;
  const positionedGlyph = model.getSelectedPositionedGlyph();

  context.translate(positionedGlyph.x, positionedGlyph.y);
  context.strokeStyle = controller.drawingParameters.handleColor;
  context.lineWidth = controller.drawingParameters.handleLineWidth;
  for (const [pt1, pt2] of positionedGlyph.glyph.path.iterHandles()) {
    strokeLine(context, pt1.x, pt1.y, pt2.x, pt2.y);
  }
}


export function drawNodesLayer(model, controller) {
  if (!model.selectedGlyph || !model.selectedGlyphIsEditing) {
    return;
  }
  const context = controller.context;
  const positionedGlyph = model.getSelectedPositionedGlyph();
  const cornerNodeSize = controller.drawingParameters.cornerNodeSize;
  const smoothNodeSize = controller.drawingParameters.smoothNodeSize;
  const handleNodeSize = controller.drawingParameters.handleNodeSize;

  context.translate(positionedGlyph.x, positionedGlyph.y);
  context.fillStyle = controller.drawingParameters.nodeFillColor;
  for (const pt of positionedGlyph.glyph.path.iterPoints()) {
    fillNode(context, pt, cornerNodeSize, smoothNodeSize, handleNodeSize);
  }
}


export function drawComponentSelectionLayer(model, controller) {
  _drawSelectionLayer(model, controller, "component");
}


export function drawPathSelectionLayer(model, controller) {
  _drawSelectionLayer(model, controller, "point");
}


function _drawSelectionLayer(model, controller, drawType) {
  if (!model.selectedGlyph || !model.selectedGlyphIsEditing) {
    return;
  }
  const selection = model.selection;
  const hoverSelection = model.hoverSelection;
  const combinedSelection = lenientUnion(selection, hoverSelection);
  const positionedGlyph = model.getSelectedPositionedGlyph();
  const selectionStrings = Array.from(combinedSelection);
  selectionStrings.sort();

  const context = controller.context;

  const cornerNodeSize = controller.drawingParameters.cornerNodeSize;
  const smoothNodeSize = controller.drawingParameters.smoothNodeSize;
  const handleNodeSize = controller.drawingParameters.handleNodeSize;
  const hoveredComponentStrokeColor = controller.drawingParameters.hoveredComponentStrokeColor;
  const componentFillColor = controller.drawingParameters.componentFillColor;
  const selectedComponentFillColor = controller.drawingParameters.selectedComponentFillColor;

  context.translate(positionedGlyph.x, positionedGlyph.y);

  context.strokeStyle = controller.drawingParameters.hoveredNodeStrokeColor;
  context.lineWidth = controller.drawingParameters.hoveredNodeLineWidth;
  const hoverStrokeOffset = 4 * controller.onePixelUnit
  context.fillStyle = controller.drawingParameters.selectedNodeFillColor;

  for (const selItem of selectionStrings) {
    const drawHoverStroke = hoverSelection?.has(selItem);
    const drawSelectionFill = selection.has(selItem);
    const [tp, index] = selItem.split("/");
    if (tp != drawType) {
      continue;
    }
    if (tp === "point") {
      const pt = positionedGlyph.glyph.path.getPoint(index);
      if (drawHoverStroke) {
        strokeNode(context, pt, cornerNodeSize + hoverStrokeOffset, smoothNodeSize + hoverStrokeOffset, handleNodeSize + hoverStrokeOffset);
      }
      if (drawSelectionFill) {
        fillNode(context, pt, cornerNodeSize, smoothNodeSize, handleNodeSize);
      }
    } else if (tp === "component") {
      const componentPath = positionedGlyph.glyph.components[index].path2d;
      context.save();
      if (drawHoverStroke) {
        drawWithDoubleStroke(context, componentPath,
          8 * controller.onePixelUnit,
          3 * controller.onePixelUnit,
          hoveredComponentStrokeColor,
          drawSelectionFill ? selectedComponentFillColor : componentFillColor,
        )
      }
      if (drawSelectionFill) {
        context.fillStyle = selectedComponentFillColor;
        context.fill(componentPath);
      }
      context.restore();
    }
  }
}


export function drawRectangleSelectionLayer(model, controller) {
  if (model.selectionRect === undefined) {
    return;
  }
  const selRect = model.selectionRect;
  const context = controller.context;
  const x = selRect.xMin;
  const y = selRect.yMin;
  const w = selRect.xMax - x;
  const h = selRect.yMax - y;
  context.lineWidth = controller.drawingParameters.rectSelectLineWidth;
  context.strokeStyle = "#000";
  context.strokeRect(x, y, w, h);
  context.strokeStyle = "#FFF";
  context.setLineDash(controller.drawingParameters.rectSelectLineDash);
  context.strokeRect(x, y, w, h);
}


function fillNode(context, pt, cornerNodeSize, smoothNodeSize, handleNodeSize) {
  if (!pt.type && !pt.smooth) {
    fillSquareNode(context, pt, cornerNodeSize);
  } else if (!pt.type) {
    fillRoundNode(context, pt, smoothNodeSize);
  } else {
    fillRoundNode(context, pt, handleNodeSize);
  }
}


function strokeNode(context, pt, cornerNodeSize, smoothNodeSize, handleNodeSize) {
  if (!pt.type && !pt.smooth) {
    strokeSquareNode(context, pt, cornerNodeSize);
  } else if (!pt.type) {
    strokeRoundNode(context, pt, smoothNodeSize);
  } else {
    strokeRoundNode(context, pt, handleNodeSize);
  }
}


function fillSquareNode(context, pt, nodeSize) {
  context.fillRect(
    pt.x - nodeSize / 2,
    pt.y - nodeSize / 2,
    nodeSize,
    nodeSize
  );
}

function fillRoundNode(context, pt, nodeSize) {
  context.beginPath();
  context.arc(pt.x, pt.y, nodeSize / 2, 0, 2 * Math.PI, false);
  context.fill();
}


function strokeSquareNode(context, pt, nodeSize) {
  context.strokeRect(
    pt.x - nodeSize / 2,
    pt.y - nodeSize / 2,
    nodeSize,
    nodeSize
  );
}


function strokeRoundNode(context, pt, nodeSize) {
  context.beginPath();
  context.arc(pt.x, pt.y, nodeSize / 2, 0, 2 * Math.PI, false);
  context.stroke();
}


function strokeLine(context, x1, y1, x2, y2) {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}


function fillPolygon(context, points, isClosed = true) {
  context.fill(polygonPath(points));
}


function polygonPath(points, isClosed = true) {
  const path = new Path2D();
  if (points && points.length) {
    path.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      path.lineTo(points[i].x, points[i].y);
    }
    if (isClosed) {
      path.closePath();
    }
  }
  return path;
}


function drawWithDoubleStroke(context, path, outerLineWidth, innerLineWidth, strokeStyle, fillStyle) {
  context.lineJoin = "round";
  context.lineWidth = outerLineWidth;
  context.strokeStyle = strokeStyle;
  context.stroke(path);
  context.lineWidth = innerLineWidth;
  context.strokeStyle = "black";
  context.globalCompositeOperation = "destination-out"
  context.stroke(path);
  context.globalCompositeOperation = "source-over"
  context.fillStyle = fillStyle;
  context.fill(path);
}


function lenientUnion(setA, setB) {
  if (!setA) {
    return setB || new Set();
  }
  if (!setB) {
    return setA || new Set();
  }
  return union(setA, setB);
}