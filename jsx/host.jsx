/**
 * Auto Subtitles Generator - Host ExtendScript
 * Compatible with Adobe After Effects CS6 through 2026+
 */

// Embedded lightweight JSON serializer/parser fallback for ExtendScript
var SubtitleJSON = (function() {
    function stringify(obj) {
        if (typeof JSON !== "undefined" && JSON.stringify) {
            try { return JSON.stringify(obj); } catch(e) {}
        }
        var t = typeof obj;
        if (t !== "object" || obj === null) {
            if (t === "string") return '"' + obj.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r") + '"';
            return String(obj);
        }
        var isArr = (obj instanceof Array);
        var parts = [];
        if (isArr) {
            for (var i = 0; i < obj.length; i++) {
                parts.push(stringify(obj[i]));
            }
            return "[" + parts.join(",") + "]";
        } else {
            for (var k in obj) {
                if (obj.hasOwnProperty(k)) {
                    parts.push('"' + k + '":' + stringify(obj[k]));
                }
            }
            return "{" + parts.join(",") + "}";
        }
    }

    function parse(str) {
        if (typeof JSON !== "undefined" && JSON.parse) {
            try { return JSON.parse(str); } catch(e) {}
        }
        return eval("(" + str + ")");
    }

    return {
        stringify: stringify,
        parse: parse
    };
})();

/**
 * Returns a dictionary of all installed fonts grouped by family
 */
function getInstalledFonts() {
    try {
        var fontMap = {};
        if (typeof app.fonts !== "undefined" && app.fonts && app.fonts.length > 0) {
            for (var i = 0; i < app.fonts.length; i++) {
                var f = app.fonts[i];
                var fam = f.familyName || "Unknown";
                var style = f.styleName || "Regular";
                var ps = f.postScriptName || (fam + "-" + style);
                if (!fontMap[fam]) {
                    fontMap[fam] = [];
                }
                fontMap[fam].push({
                    style: style,
                    postScriptName: ps
                });
            }
        }
        return SubtitleJSON.stringify({ ok: true, fonts: fontMap });
    } catch(err) {
        return SubtitleJSON.stringify({ ok: false, error: err.toString() });
    }
}

/**
 * Returns a list of all compositions in the active project and the active comp ID
 */
function getProjectCompositions() {
    try {
        if (!app.project) {
            return SubtitleJSON.stringify({ ok: false, error: "No active project found in After Effects." });
        }

        var comps = [];
        var activeCompId = null;

        if (app.project.activeItem && app.project.activeItem instanceof CompItem) {
            activeCompId = app.project.activeItem.id;
        }

        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem) {
                // Ignore subtitle chunk comps and master subtitle precomps from listing to keep it clean
                if (item.name.indexOf("Sub_") === 0 || item.name.indexOf("[Subtitles]") === 0 || item.name.indexOf("[Chunk]") !== -1) {
                    continue;
                }
                comps.push({
                    id: item.id,
                    name: item.name,
                    width: item.width,
                    height: item.height,
                    duration: Math.round(item.duration * 100) / 100,
                    frameRate: Math.round(item.frameRate * 100) / 100
                });
            }
        }

        return SubtitleJSON.stringify({
            ok: true,
            activeCompId: activeCompId,
            comps: comps
        });
    } catch(err) {
        return SubtitleJSON.stringify({ ok: false, error: err.toString() });
    }
}

/**
 * Finds an existing Subtitle Controls layer in a comp or any other comp in the project
 */
function findSubtitleControlsLayer(comp) {
    if (!comp || !(comp instanceof CompItem)) return null;
    var ctrlName = "[CTRL] Subtitles - " + comp.name;
    for (var l = 1; l <= comp.numLayers; l++) {
        var lyr = comp.layer(l);
        if (lyr.name === ctrlName || lyr.name === "Subtitle Controls" || lyr.name.indexOf("[CTRL] Subtitles") === 0) {
            return lyr;
        }
    }
    return null;
}

/**
 * Reads existing subtitle settings from the selected comp or any other comp in the project
 */
function getExistingSubtitleSettings(compId) {
    try {
        var targetComp = null;
        if (compId) {
            targetComp = app.project.itemByID(compId);
        }
        if (!targetComp || !(targetComp instanceof CompItem)) {
            if (app.project.activeItem && app.project.activeItem instanceof CompItem) {
                targetComp = app.project.activeItem;
            }
        }

        var ctrl = findSubtitleControlsLayer(targetComp);

        // If target comp has no subtitle controller, look across all other comps in the project
        if (!ctrl) {
            for (var i = 1; i <= app.project.numItems; i++) {
                var it = app.project.item(i);
                if (it instanceof CompItem && it.name.indexOf("[Subtitles]") === -1 && it.name.indexOf("Sub_") === -1) {
                    ctrl = findSubtitleControlsLayer(it);
                    if (ctrl) break;
                }
            }
        }

        if (!ctrl) {
            return SubtitleJSON.stringify({ ok: false, found: false });
        }

        var settings = {};
        function getPropVal(propName) {
            try {
                var p = ctrl.property("Effects").property(propName);
                if (p) {
                    if (p.property("Slider")) return p.property("Slider").value;
                    if (p.property("Color")) return p.property("Color").value;
                }
            } catch(e) {}
            return null;
        }

        settings.fontSize = getPropVal("Font Size");
        settings.wordSpacing = getPropVal("Word Spacing");
        settings.posY = getPropVal("Vertical Position Y");
        settings.boxPadX = getPropVal("Box Padding X");
        settings.boxPadY = getPropVal("Box Padding Y");
        settings.boxRoundness = getPropVal("Box Roundness");
        settings.boxColor = getPropVal("Box Color");
        settings.boxOpacity = getPropVal("Box Opacity");
        settings.popAmount = getPropVal("Pop Scale Amount");
        settings.textColor = getPropVal("Text Color");
        settings.shadowColor = getPropVal("Shadow Color");
        settings.shadowOpacity = getPropVal("Shadow Opacity");
        settings.shadowDistance = getPropVal("Shadow Distance");
        settings.shadowSoftness = getPropVal("Shadow Softness");

        return SubtitleJSON.stringify({ ok: true, found: true, settings: settings });
    } catch(err) {
        return SubtitleJSON.stringify({ ok: false, error: err.toString() });
    }
}

/**
 * Exports composition audio to a temporary audio file (AIFF 48kHz) via Render Queue
 */
function exportCompAudio(compId, targetFilePath) {
    try {
        var comp = app.project.itemByID(compId);
        if (!comp || !(comp instanceof CompItem)) {
            return SubtitleJSON.stringify({ ok: false, error: "Composition not found." });
        }

        var destFile = new File(targetFilePath);
        if (destFile.exists) {
            try { destFile.remove(); } catch(e) {}
        }

        var rq = app.project.renderQueue;
        var item = rq.items.add(comp);
        var om = item.outputModule(1);

        // Find best audio template
        var preferredTemplates = ["AIFF 48kHz", "Lossless", "High Quality"];
        for (var t = 0; t < preferredTemplates.length; t++) {
            try {
                om.applyTemplate(preferredTemplates[t]);
                break;
            } catch(e) {}
        }

        om.file = destFile;
        item.render = true;

        rq.render();
        item.remove();

        if (destFile.exists) {
            return SubtitleJSON.stringify({ ok: true, path: destFile.fsName });
        } else {
            return SubtitleJSON.stringify({ ok: false, error: "Audio export completed but file was not generated." });
        }
    } catch(err) {
        return SubtitleJSON.stringify({ ok: false, error: "Audio export failed: " + err.toString() });
    }
}

/**
 * Creates a brand new composition, imports the specified audio file, and sets up timeline
 */
function createNewCompWithAudio(audioFilePath, compName, width, height, fps) {
    app.beginUndoGroup("Create Subtitle Comp");
    try {
        var audioFile = new File(audioFilePath);
        if (!audioFile.exists) {
            return SubtitleJSON.stringify({ ok: false, error: "Audio file not found: " + audioFilePath });
        }

        // Import footage
        var io = new ImportOptions(audioFile);
        var audioFootage = app.project.importFile(io);

        var duration = 30.0;
        if (audioFootage.duration && audioFootage.duration > 0) {
            duration = Math.ceil(audioFootage.duration + 0.5);
        }

        var comp = app.project.items.addComp(compName, width, height, 1, duration, fps);
        var audioLayer = comp.layers.add(audioFootage);
        audioLayer.name = audioFootage.name;

        comp.openInViewer();

        return SubtitleJSON.stringify({
            ok: true,
            compId: comp.id,
            compName: comp.name,
            duration: comp.duration
        });
    } catch(err) {
        return SubtitleJSON.stringify({ ok: false, error: "Failed to create comp: " + err.toString() });
    } finally {
        app.endUndoGroup();
    }
}

/**
 * Updates the font of all existing subtitle layers and reference layer in a specific composition
 */
function updateSubtitlesFont(compId, postScriptName) {
    app.beginUndoGroup("Update Subtitles Font");
    try {
        var comp = null;
        if (compId) {
            comp = app.project.itemByID(compId);
        }
        if (!comp || !(comp instanceof CompItem)) {
            if (app.project.activeItem && app.project.activeItem instanceof CompItem) {
                comp = app.project.activeItem;
            }
        }
        if (!comp) {
            return SubtitleJSON.stringify({ ok: false, error: "Please select an active composition with subtitles." });
        }

        var refLyrName = "[REF] Subtitle Style - " + comp.name;

        // 1. Update Subtitle Style Reference layer if present in this comp
        for (var l = 1; l <= comp.numLayers; l++) {
            var lyr = comp.layer(l);
            if ((lyr.name === refLyrName || lyr.name === "Subtitle Style Reference") && lyr.property("Source Text")) {
                var doc = lyr.property("Source Text").value;
                try {
                    doc.font = postScriptName;
                    lyr.property("Source Text").setValue(doc);
                } catch(e) {}
            }
        }

        // 2. Locate only the master subtitle comp for THIS composition
        var subCompName = "[Subtitles] " + comp.name;
        var subComp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem && it.name === subCompName) {
                subComp = it;
                break;
            }
        }

        var updatedCount = 0;
        if (subComp) {
            // Only update chunk comps referenced inside this comp's master subtitle comp
            for (var sl = 1; sl <= subComp.numLayers; sl++) {
                var cLyr = subComp.layer(sl);
                if (cLyr.source && cLyr.source instanceof CompItem) {
                    var chunkComp = cLyr.source;
                    for (var wl = 1; wl <= chunkComp.numLayers; wl++) {
                        var wLayer = chunkComp.layer(wl);
                        if (wLayer.name.indexOf("W_") === 0 && wLayer.property("Source Text")) {
                            var wDoc = wLayer.property("Source Text").value;
                            try {
                                wDoc.font = postScriptName;
                                wLayer.property("Source Text").setValue(wDoc);
                                updatedCount++;
                            } catch(e) {}
                        }
                    }
                }
            }
        }

        // Refresh viewer
        comp.openInViewer();

        return SubtitleJSON.stringify({
            ok: true,
            compName: comp.name,
            updatedLayers: updatedCount,
            font: postScriptName
        });
    } catch(err) {
        return SubtitleJSON.stringify({ ok: false, error: "Failed to update font: " + err.toString() });
    } finally {
        app.endUndoGroup();
    }
}

/**
 * Builds the complete TikTok / Reel subtitle hierarchy inside target composition
 * Fully isolated per composition and fully keyframe-animatable!
 */
function generateSubtitles(payloadJsonStr) {
    app.beginUndoGroup("Auto Subtitles Generator");
    try {
        var payload = SubtitleJSON.parse(payloadJsonStr);
        var targetComp = app.project.itemByID(payload.targetCompId);
        if (!targetComp || !(targetComp instanceof CompItem)) {
            throw new Error("Target composition not found.");
        }

        var chunksData = payload.chunks;
        if (!chunksData || chunksData.length === 0) {
            throw new Error("No subtitle chunks provided.");
        }

        var style = payload.style || {};
        var fontSize = Number(style.fontSize) || 62;
        var wordSpacing = Number(style.wordSpacing) || 18;
        var posY = (style.posY !== undefined && style.posY !== null) ? Number(style.posY) : Math.round(targetComp.height * 0.72);
        var boxPadX = Number(style.boxPadX) || 26;
        var boxPadY = Number(style.boxPadY) || 16;
        var boxRoundness = Number(style.boxRoundness) || 18;
        var boxOpacity = (style.boxOpacity !== undefined) ? Number(style.boxOpacity) : 85;
        var popAmt = (style.popAmount !== undefined) ? Number(style.popAmount) : 6;
        var boxColor = style.boxColor || [0.10, 0.10, 0.12, 1];
        var textColor = style.textColor || [1, 1, 1];
        var shadowColor = style.shadowColor || [0, 0, 0, 1];
        var shadowOpacity = (style.shadowOpacity !== undefined) ? Number(style.shadowOpacity) : 60;
        var shadowDistance = (style.shadowDistance !== undefined) ? Number(style.shadowDistance) : 3;
        var shadowSoftness = (style.shadowSoftness !== undefined) ? Number(style.shadowSoftness) : 6;
        var fontPostScript = style.fontPostScriptName || style.fontFamily || "SharpGrotesk-Bold16";
        var fontFamilyDisplay = style.fontFamily || "Sharp Grotesk";

        var compEscapedName = targetComp.name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        var subCompName = "[Subtitles] " + targetComp.name;
        var subCompEscapedName = subCompName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        var ctrlLayerName = "[CTRL] Subtitles - " + targetComp.name;
        var ctrlLayerEscapedName = ctrlLayerName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        var refLayerName = "[REF] Subtitle Style - " + targetComp.name;

        // 0. Clean up previous subtitle comps and layers strictly belonging to targetComp
        for (var cl = targetComp.numLayers; cl >= 1; cl--) {
            var ml = targetComp.layer(cl);
            if (ml.name === ctrlLayerName || ml.name === "Subtitle Controls" || ml.name.indexOf("[CTRL] Subtitles") === 0 ||
                ml.name === refLayerName || ml.name === "Subtitle Style Reference" || ml.name.indexOf("[REF] Subtitle Style") === 0 ||
                ml.name === subCompName) {
                ml.remove();
            }
        }

        // 1. Folder structure in Project panel: strictly isolated per composition
        // Root folder: 01_SUBTITLES
        var rootFolder = null;
        for (var f = 1; f <= app.project.numItems; f++) {
            if (app.project.item(f) instanceof FolderItem && app.project.item(f).name === "01_SUBTITLES") {
                rootFolder = app.project.item(f);
                break;
            }
        }
        if (!rootFolder) rootFolder = app.project.items.addFolder("01_SUBTITLES");

        // Comp dedicated folder: 01_SUBTITLES / [Subtitles] <CompName>
        var compFolder = null;
        var compFolderName = "[Subtitles] " + targetComp.name;
        for (var cf = 1; cf <= app.project.numItems; cf++) {
            var itemF = app.project.item(cf);
            if (itemF instanceof FolderItem && itemF.parentFolder === rootFolder && itemF.name === compFolderName) {
                compFolder = itemF;
                break;
            }
        }

        // If compFolder already existed from a previous run on THIS comp, clean it up
        if (compFolder) {
            try { compFolder.remove(); } catch(e) {}
            compFolder = null;
        }

        // Clean up any loose master subComp with this name if exists
        for (var sc = app.project.numItems; sc >= 1; sc--) {
            var scItem = app.project.item(sc);
            if (scItem instanceof CompItem && scItem.name === subCompName) {
                try { scItem.remove(); } catch(e) {}
            }
        }

        // Create fresh dedicated folder for targetComp
        compFolder = app.project.items.addFolder(compFolderName);
        compFolder.parentFolder = rootFolder;

        var chunksFolder = app.project.items.addFolder("Chunks");
        chunksFolder.parentFolder = compFolder;

        // 2. Master Subtitle Comp inside compFolder
        var subComp = app.project.items.addComp(subCompName, targetComp.width, targetComp.height, targetComp.pixelAspect, targetComp.duration, targetComp.frameRate);
        subComp.parentFolder = compFolder;

        // 3. Setup Master Controller in targetComp
        var ctrl = targetComp.layers.addNull();
        ctrl.name = ctrlLayerName;
        ctrl.label = 13; // Cyan color tag in After Effects for instant identification!

        // Controllers
        var sFontSize = ctrl.property("Effects").addProperty("ADBE Slider Control");
        sFontSize.name = "Font Size"; sFontSize.property("Slider").setValue(fontSize);

        var sGap = ctrl.property("Effects").addProperty("ADBE Slider Control");
        sGap.name = "Word Spacing"; sGap.property("Slider").setValue(wordSpacing);

        var sPosY = ctrl.property("Effects").addProperty("ADBE Slider Control");
        sPosY.name = "Vertical Position Y"; sPosY.property("Slider").setValue(posY);

        var sPadX = ctrl.property("Effects").addProperty("ADBE Slider Control");
        sPadX.name = "Box Padding X"; sPadX.property("Slider").setValue(boxPadX);

        var sPadY = ctrl.property("Effects").addProperty("ADBE Slider Control");
        sPadY.name = "Box Padding Y"; sPadY.property("Slider").setValue(boxPadY);

        var sRound = ctrl.property("Effects").addProperty("ADBE Slider Control");
        sRound.name = "Box Roundness"; sRound.property("Slider").setValue(boxRoundness);

        var sBoxColor = ctrl.property("Effects").addProperty("ADBE Color Control");
        sBoxColor.name = "Box Color"; sBoxColor.property("Color").setValue(boxColor);

        var sBoxOpacity = ctrl.property("Effects").addProperty("ADBE Slider Control");
        sBoxOpacity.name = "Box Opacity"; sBoxOpacity.property("Slider").setValue(boxOpacity);

        var sPopAmt = ctrl.property("Effects").addProperty("ADBE Slider Control");
        sPopAmt.name = "Pop Scale Amount"; sPopAmt.property("Slider").setValue(popAmt);

        var sTextColor = ctrl.property("Effects").addProperty("ADBE Color Control");
        sTextColor.name = "Text Color"; sTextColor.property("Color").setValue([textColor[0], textColor[1], textColor[2], 1]);

        var sShadowColor = ctrl.property("Effects").addProperty("ADBE Color Control");
        sShadowColor.name = "Shadow Color"; sShadowColor.property("Color").setValue(shadowColor);

        var sShadowOpacity = ctrl.property("Effects").addProperty("ADBE Slider Control");
        sShadowOpacity.name = "Shadow Opacity"; sShadowOpacity.property("Slider").setValue(shadowOpacity);

        var sShadowDist = ctrl.property("Effects").addProperty("ADBE Slider Control");
        sShadowDist.name = "Shadow Distance"; sShadowDist.property("Slider").setValue(shadowDistance);

        var sShadowSoft = ctrl.property("Effects").addProperty("ADBE Slider Control");
        sShadowSoft.name = "Shadow Softness"; sShadowSoft.property("Slider").setValue(shadowSoftness);

        // 4. Style Reference layer
        var styleRef = targetComp.layers.addText(fontFamilyDisplay);
        styleRef.name = refLayerName;
        styleRef.guideLayer = true;
        styleRef.enabled = false;
        styleRef.label = 9; // Green color tag for reference layers
        var refDoc = styleRef.property("Source Text").value;
        refDoc.fontSize = fontSize;
        refDoc.fillColor = textColor;
        refDoc.applyFill = true;
        try {
            refDoc.font = fontPostScript;
        } catch(fe) {}
        styleRef.property("Source Text").setValue(refDoc);

        // 5. Build Chunk Comps
        var createdComps = [];

        // Short comp identifier prefix for chunk comps to avoid any name collision
        var cleanCompTag = targetComp.name.replace(/[^a-zA-Z0-9]/g, "").substring(0, 8);

        for (var k = 0; k < chunksData.length; k++) {
            var cData = chunksData[k];
            var chunkTitle = "[" + cleanCompTag + "] " + cData.title;
            var cComp = app.project.items.addComp(chunkTitle, targetComp.width, targetComp.height, targetComp.pixelAspect, cData.duration, targetComp.frameRate);
            cComp.parentFolder = chunksFolder;
            createdComps.push({ comp: cComp, start: cData.start, end: cData.end });

            var wordNamesArr = [];
            var wordTimesArr = [];
            for (var w = 0; w < cData.words.length; w++) {
                wordNamesArr.push('"' + cData.words[w].name + '"');
                wordTimesArr.push('{start:' + cData.words[w].start + ', end:' + cData.words[w].end + ', name:"' + cData.words[w].name + '"}');
            }
            var wordNamesStr = '[' + wordNamesArr.join(',') + ']';
            var wordTimesStr = '[' + wordTimesArr.join(',') + ']';

            // Common global time resolution expression snippet across all chunk expressions:
            // Converts local chunk comp time to targetComp global time so all keyframes work!
            var timeCodeSnippet =
                'var t = time;\n' +
                'try {\n' +
                '    var sComp = comp("' + subCompEscapedName + '");\n' +
                '    var myLyr = sComp.layer(thisComp.name);\n' +
                '    var mComp = comp("' + compEscapedName + '");\n' +
                '    var sLyr = mComp.layer("' + subCompEscapedName + '");\n' +
                '    t = time + myLyr.startTime + sLyr.startTime;\n' +
                '} catch(e) { t = time + ' + cData.start + '; }\n' +
                'var ctrl = null;\n' +
                'try { ctrl = comp("' + compEscapedName + '").layer("' + ctrlLayerEscapedName + '"); } catch(e) {}\n' +
                'if (!ctrl) { try { ctrl = comp("' + compEscapedName + '").layer("Subtitle Controls"); } catch(e) {} }\n';

            // 5a. Add Word text layers FIRST so they exist when Highlight Box evaluates
            for (var w = 0; w < cData.words.length; w++) {
                var wObj = cData.words[w];
                var wl = cComp.layers.addText(wObj.text);
                wl.name = wObj.name;
                var tDoc = wl.property("Source Text").value;
                tDoc.fontSize = fontSize;
                tDoc.fillColor = textColor;
                tDoc.applyFill = true;
                tDoc.justification = ParagraphJustification.CENTER_JUSTIFY;
                try {
                    tDoc.font = fontPostScript;
                } catch(te) {}
                wl.property("Source Text").setValue(tDoc);

                // Source Text expression: reacts dynamically to Font Size, Text Color, and Reference Font
                wl.property("Source Text").expression =
                    timeCodeSnippet +
                    'var s = text.sourceText.style;\n' +
                    'if (ctrl) {\n' +
                    '    try {\n' +
                    '        var sz = ctrl.effect("Font Size")("Slider").valueAtTime(t);\n' +
                    '        s.setFontSize(sz);\n' +
                    '    } catch(e) {}\n' +
                    '    try {\n' +
                    '        var tc = ctrl.effect("Text Color")("Color").valueAtTime(t);\n' +
                    '        s.setFillColor([tc[0], tc[1], tc[2]]);\n' +
                    '    } catch(e) {}\n' +
                    '}\n' +
                    'try {\n' +
                    '    var ref = comp("' + compEscapedName + '").layer("' + refLayerName.replace(/"/g, '\\"') + '");\n' +
                    '    if (!ref) ref = comp("' + compEscapedName + '").layer("Subtitle Style Reference");\n' +
                    '    if (ref && ref.text && ref.text.sourceText) {\n' +
                    '        var rStyle = ref.text.sourceText.style;\n' +
                    '        if (rStyle && rStyle.font) s.setFont(rStyle.font);\n' +
                    '    }\n' +
                    '} catch(e) {}\n' +
                    's;';

                wl.transform.anchorPoint.expression =
                    'try {\n' +
                    '    var r = sourceRectAtTime(time, false);\n' +
                    '    [r.left + r.width/2, 0];\n' +
                    '} catch(e) { [0, 0]; }';

                // Word position expression with global time evaluation for spacing and Y position
                wl.transform.position.expression =
                    timeCodeSnippet +
                    'var gap = 18; var y = 1380;\n' +
                    'if (ctrl) {\n' +
                    '    try { gap = ctrl.effect("Word Spacing")("Slider").valueAtTime(t); } catch(e) {}\n' +
                    '    try { y = ctrl.effect("Vertical Position Y")("Slider").valueAtTime(t); } catch(e) {}\n' +
                    '}\n' +
                    'var wordNames = ' + wordNamesStr + ';\n' +
                    'var myIdx = ' + w + ';\n' +
                    'var totalW = 0;\n' +
                    'var widths = [];\n' +
                    'for (var j = 0; j < wordNames.length; j++) {\n' +
                    '    var wVal = 60;\n' +
                    '    try {\n' +
                    '        var wlLayer = thisComp.layer(wordNames[j]);\n' +
                    '        if (wlLayer) {\n' +
                    '            var r = wlLayer.sourceRectAtTime(time, false);\n' +
                    '            if (r && r.width > 0) wVal = r.width;\n' +
                    '        }\n' +
                    '    } catch(e) {}\n' +
                    '    widths.push(wVal);\n' +
                    '    totalW += wVal;\n' +
                    '}\n' +
                    'totalW += (wordNames.length - 1) * gap;\n' +
                    'var startX = (thisComp.width - totalW) / 2;\n' +
                    'var currX = startX;\n' +
                    'for (var j = 0; j < myIdx; j++) { currX += widths[j] + gap; }\n' +
                    'currX += widths[myIdx] / 2;\n' +
                    '[currX, y];';

                // Add drop shadow linked to animatable controller properties
                try {
                    var ds = wl.property("Effects").addProperty("ADBE Drop Shadow");
                    ds.property("Shadow Color").setValue(shadowColor);
                    ds.property("Opacity").setValue(shadowOpacity);
                    ds.property("Distance").setValue(shadowDistance);
                    ds.property("Softness").setValue(shadowSoftness);

                    ds.property("Shadow Color").expression =
                        timeCodeSnippet +
                        'if (ctrl && ctrl.effect("Shadow Color")) ctrl.effect("Shadow Color")("Color").valueAtTime(t); else [0, 0, 0, 1];';

                    ds.property("Opacity").expression =
                        timeCodeSnippet +
                        'if (ctrl && ctrl.effect("Shadow Opacity")) ctrl.effect("Shadow Opacity")("Slider").valueAtTime(t); else 60;';

                    ds.property("Distance").expression =
                        timeCodeSnippet +
                        'if (ctrl && ctrl.effect("Shadow Distance")) ctrl.effect("Shadow Distance")("Slider").valueAtTime(t); else 3;';

                    ds.property("Softness").expression =
                        timeCodeSnippet +
                        'if (ctrl && ctrl.effect("Shadow Softness")) ctrl.effect("Shadow Softness")("Slider").valueAtTime(t); else 6;';
                } catch(dse) {}
            }

            // 5b. Highlight Box: animatable color, opacity, roundness, size, and pop!
            var box = cComp.layers.addShape();
            box.name = "Highlight Box";
            var grp = box.property("Contents").addProperty("ADBE Vector Group");
            grp.name = "Box Group";
            var grpContents = grp.property("Contents");
            grpContents.addProperty("ADBE Vector Shape - Rect").name = "Rect Path";
            grpContents.addProperty("ADBE Vector Graphic - Fill").name = "Fill 1";

            var rPath = grpContents.property("Rect Path");
            var rFill = grpContents.property("Fill 1");

            // Animatable Box Roundness
            rPath.property("Roundness").expression =
                timeCodeSnippet +
                'if (ctrl && ctrl.effect("Box Roundness")) ctrl.effect("Box Roundness")("Slider").valueAtTime(t); else 18;';

            // Animatable Box Color (crucial bug fix: evaluates at global time t!)
            rFill.property("Color").expression =
                timeCodeSnippet +
                'if (ctrl && ctrl.effect("Box Color")) ctrl.effect("Box Color")("Color").valueAtTime(t); else [0.1, 0.1, 0.12, 1];';

            // Animatable Box Opacity
            rFill.property("Opacity").expression =
                timeCodeSnippet +
                'if (ctrl && ctrl.effect("Box Opacity")) ctrl.effect("Box Opacity")("Slider").valueAtTime(t); else 85;';

            // Animatable Box Size
            rPath.property("Size").expression =
                timeCodeSnippet +
                'var wordTimes = ' + wordTimesStr + ';\n' +
                'var active = wordTimes[0].name;\n' +
                'for (var i = 0; i < wordTimes.length; i++) { if (time >= wordTimes[i].start) active = wordTimes[i].name; }\n' +
                'var sz = 62; var padX = 26; var padY = 16;\n' +
                'if (ctrl) {\n' +
                '    try { sz = ctrl.effect("Font Size")("Slider").valueAtTime(t); } catch(e) {}\n' +
                '    try { padX = ctrl.effect("Box Padding X")("Slider").valueAtTime(t); } catch(e) {}\n' +
                '    try { padY = ctrl.effect("Box Padding Y")("Slider").valueAtTime(t); } catch(e) {}\n' +
                '}\n' +
                'var w = 120;\n' +
                'try {\n' +
                '    var activeL = thisComp.layer(active);\n' +
                '    if (activeL) {\n' +
                '        var r = activeL.sourceRectAtTime(time, false);\n' +
                '        if (r && r.width > 0) w = r.width;\n' +
                '    }\n' +
                '} catch(e) {}\n' +
                '[w + padX * 2, sz * 1.15 + padY * 2];';

            // Animatable Box Position
            box.transform.position.expression =
                timeCodeSnippet +
                'var wordTimes = ' + wordTimesStr + ';\n' +
                'var active = wordTimes[0].name;\n' +
                'for (var i = 0; i < wordTimes.length; i++) { if (time >= wordTimes[i].start) active = wordTimes[i].name; }\n' +
                'var sz = 62; var y = 1380;\n' +
                'if (ctrl) {\n' +
                '    try { sz = ctrl.effect("Font Size")("Slider").valueAtTime(t); } catch(e) {}\n' +
                '    try { y = ctrl.effect("Vertical Position Y")("Slider").valueAtTime(t); } catch(e) {}\n' +
                '}\n' +
                'var posX = thisComp.width / 2;\n' +
                'try {\n' +
                '    var activeL = thisComp.layer(active);\n' +
                '    if (activeL && activeL.transform && activeL.transform.position) {\n' +
                '        posX = activeL.transform.position[0];\n' +
                '    }\n' +
                '} catch(e) {}\n' +
                '[posX, y - sz * 0.35];';

            // Animatable Pop Scale
            box.transform.scale.expression =
                timeCodeSnippet +
                'var wordTimes = ' + wordTimesStr + ';\n' +
                'var popAmt = 6;\n' +
                'if (ctrl && ctrl.effect("Pop Scale Amount")) {\n' +
                '    try { popAmt = ctrl.effect("Pop Scale Amount")("Slider").valueAtTime(t); } catch(e) {}\n' +
                '}\n' +
                'var pop = 100;\n' +
                'var popDur = 0.12;\n' +
                'for (var i = 0; i < wordTimes.length; i++) {\n' +
                '    if (time >= wordTimes[i].start && time < wordTimes[i].start + popDur) {\n' +
                '        var p = (time - wordTimes[i].start) / popDur;\n' +
                '        pop = 100 + popAmt * Math.cos(p * Math.PI / 2);\n' +
                '    }\n' +
                '}\n' +
                '[pop, pop];';

            // Send highlight box to bottom of layer stack
            box.moveToEnd();
        }

        // 6. Sequence chunk comps in subComp in reverse order so Sub_01 is on top
        for (var m = createdComps.length - 1; m >= 0; m--) {
            var item = createdComps[m];
            var sLyr = subComp.layers.add(item.comp);
            sLyr.name = item.comp.name;
            sLyr.startTime = item.start;
            sLyr.inPoint = item.start;
            sLyr.outPoint = item.end;
        }

        // 7. Place subComp in targetComp
        var subLyrInMain = targetComp.layers.add(subComp);
        subLyrInMain.name = subCompName;
        subLyrInMain.startTime = 0;
        subLyrInMain.inPoint = 0;
        subLyrInMain.outPoint = targetComp.duration;
        subLyrInMain.label = 5; // Lavender color tag

        ctrl.moveToBeginning();
        styleRef.moveAfter(ctrl);
        subLyrInMain.moveAfter(styleRef);

        // Bring target comp to viewer and scrub slightly to clear transient cache
        targetComp.openInViewer();
        try {
            targetComp.time = 0.04;
            targetComp.time = 0;
        } catch(te) {}

        return SubtitleJSON.stringify({
            ok: true,
            totalChunks: createdComps.length,
            compName: targetComp.name
        });
    } catch(err) {
        return SubtitleJSON.stringify({ ok: false, error: "Subtitle build failed: " + err.toString() });
    } finally {
        app.endUndoGroup();
    }
}
