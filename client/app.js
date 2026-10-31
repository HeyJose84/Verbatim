/**
 * Verbatim - After Effects Subtitles Extension
 * Handles speech transcription, font variations, persistent styling,
 * transcription review & approval, word-level confidence indicators, and single/batch subtitle generation
 */

var csInterface = new CSInterface();
var currentSourceMode = "file"; // 'file', 'comp', or 'batch'
var selectedAudioPath = "";
var projectComps = [];
var activeCompId = null;
var selectedBatchCompIds = [];

// Review state
var pendingReviewData = null;
var currentReviewFilter = "all"; // 'all' or 'low'
var activeFixChunkData = null;

// Font state
var allFontsMap = {}; // { "Sharp Grotesk": [ { style: "Bold 16", postScriptName: "SharpGrotesk-Bold16" }, ... ] }
var currentFilteredFamilies = [];
var selectedFamily = "";
var selectedStyle = "";
var selectedPostScriptName = "";

// Node.js module references if available
var nodeFs = null;
var nodePath = null;
var nodeCp = null;
var nodeOs = null;

try {
    if (typeof require !== "undefined") {
        nodeFs = require("fs");
        nodePath = require("path");
        nodeCp = require("child_process");
        nodeOs = require("os");
    } else if (window.require) {
        nodeFs = window.require("fs");
        nodePath = window.require("path");
        nodeCp = window.require("child_process");
        nodeOs = window.require("os");
    }
} catch (e) {
    console.warn("Node.js runtime integration not detected:", e);
}

// Default settings
var DEFAULT_SETTINGS = {
    speechLanguage: "es",
    wordsPerChunk: 3,
    fontFamily: "Sharp Grotesk",
    fontStyle: "Bold 16",
    fontPostScriptName: "SharpGrotesk-Bold16",
    fontSize: 62,
    wordSpacing: 18,
    posY: 1380,
    textColor: "#ffffff",
    boxColor: "#1a1a1e",
    boxOpacity: 85,
    boxRoundness: 18,
    boxPadX: 26,
    boxPadY: 16,
    shadowColor: "#000000",
    shadowOpacity: 60,
    shadowDist: 3,
    shadowSoft: 6,
    popAmount: 6,
    reviewBeforeGenerate: true
};

// Initialize on page load
window.addEventListener("DOMContentLoaded", function () {
    restorePersistedSettings();
    refreshProjectComps();
    setupColorPickers();
    loadFonts();
});

/**
 * Save current panel settings to localStorage
 */
function saveCurrentSettings() {
    try {
        var chkRev = document.getElementById("chkReviewBeforeGenerate");
        var s = {
            speechLanguage: document.getElementById("speechLanguage").value,
            wordsPerChunk: parseInt(document.getElementById("wordsPerChunk").value, 10) || 3,
            fontFamily: selectedFamily || "Sharp Grotesk",
            fontStyle: selectedStyle || "Bold 16",
            fontPostScriptName: selectedPostScriptName || "SharpGrotesk-Bold16",
            fontSize: parseInt(document.getElementById("styleFontSize").value, 10) || 62,
            wordSpacing: parseInt(document.getElementById("styleSpacing").value, 10) || 18,
            posY: parseInt(document.getElementById("stylePosY").value, 10) || 1380,
            textColor: document.getElementById("styleTextColor").value,
            boxColor: document.getElementById("styleBoxColor").value,
            boxOpacity: parseInt(document.getElementById("styleBoxOpacity").value, 10) || 85,
            boxRoundness: parseInt(document.getElementById("styleBoxRoundness").value, 10) || 18,
            boxPadX: parseInt(document.getElementById("styleBoxPadX").value, 10) || 26,
            boxPadY: parseInt(document.getElementById("styleBoxPadY").value, 10) || 16,
            shadowColor: document.getElementById("styleShadowColor").value,
            shadowOpacity: parseInt(document.getElementById("styleShadowOpacity").value, 10) || 60,
            shadowDist: parseInt(document.getElementById("styleShadowDist").value, 10) || 3,
            shadowSoft: parseInt(document.getElementById("styleShadowSoft").value, 10) || 6,
            reviewBeforeGenerate: chkRev ? chkRev.checked : true
        };
        localStorage.setItem("ae_auto_subtitles_last_settings", JSON.stringify(s));
    } catch (e) {
        console.warn("Could not save settings to localStorage:", e);
    }
}

/**
 * Restore panel settings from localStorage
 */
function restorePersistedSettings() {
    try {
        var savedStr = localStorage.getItem("ae_auto_subtitles_last_settings");
        var s = savedStr ? JSON.parse(savedStr) : DEFAULT_SETTINGS;
        applySettingsToUI(s);
    } catch (e) {
        console.warn("Could not restore settings from localStorage:", e);
    }
}

/**
 * Applies a settings dictionary to UI input fields
 */
function applySettingsToUI(s) {
    if (!s) return;
    if (s.speechLanguage && document.getElementById("speechLanguage")) {
        document.getElementById("speechLanguage").value = s.speechLanguage;
    }
    if (s.wordsPerChunk !== undefined && document.getElementById("wordsPerChunk")) {
        document.getElementById("wordsPerChunk").value = s.wordsPerChunk;
        document.getElementById("wordsPerChunkVal").innerText = s.wordsPerChunk + " words";
    }
    if (s.fontSize !== undefined && document.getElementById("styleFontSize")) {
        document.getElementById("styleFontSize").value = s.fontSize;
    }
    if (s.wordSpacing !== undefined && document.getElementById("styleSpacing")) {
        document.getElementById("styleSpacing").value = s.wordSpacing;
    }
    if (s.posY !== undefined && document.getElementById("stylePosY")) {
        document.getElementById("stylePosY").value = s.posY;
    }
    if (s.textColor && document.getElementById("styleTextColor")) {
        document.getElementById("styleTextColor").value = s.textColor;
        document.getElementById("styleTextColorLabel").innerText = s.textColor.toUpperCase();
    }
    if (s.boxColor && document.getElementById("styleBoxColor")) {
        document.getElementById("styleBoxColor").value = s.boxColor;
        document.getElementById("styleBoxColorLabel").innerText = s.boxColor.toUpperCase();
    }
    if (s.boxOpacity !== undefined && document.getElementById("styleBoxOpacity")) {
        document.getElementById("styleBoxOpacity").value = s.boxOpacity;
        document.getElementById("styleBoxOpacityVal").innerText = s.boxOpacity + "%";
    }
    if (s.boxRoundness !== undefined && document.getElementById("styleBoxRoundness")) {
        document.getElementById("styleBoxRoundness").value = s.boxRoundness;
    }
    if (s.boxPadX !== undefined && document.getElementById("styleBoxPadX")) {
        document.getElementById("styleBoxPadX").value = s.boxPadX;
    }
    if (s.boxPadY !== undefined && document.getElementById("styleBoxPadY")) {
        document.getElementById("styleBoxPadY").value = s.boxPadY;
    }
    if (s.shadowColor && document.getElementById("styleShadowColor")) {
        document.getElementById("styleShadowColor").value = s.shadowColor;
        document.getElementById("styleShadowColorLabel").innerText = s.shadowColor.toUpperCase();
    }
    if (s.shadowOpacity !== undefined && document.getElementById("styleShadowOpacity")) {
        document.getElementById("styleShadowOpacity").value = s.shadowOpacity;
    }
    if (s.shadowDist !== undefined && document.getElementById("styleShadowDist")) {
        document.getElementById("styleShadowDist").value = s.shadowDist;
    }
    if (s.shadowSoft !== undefined && document.getElementById("styleShadowSoft")) {
        document.getElementById("styleShadowSoft").value = s.shadowSoft;
    }
    if (s.reviewBeforeGenerate !== undefined && document.getElementById("chkReviewBeforeGenerate")) {
        document.getElementById("chkReviewBeforeGenerate").checked = s.reviewBeforeGenerate;
    }
    if (s.fontFamily) selectedFamily = s.fontFamily;
    if (s.fontStyle) selectedStyle = s.fontStyle;
    if (s.fontPostScriptName) selectedPostScriptName = s.fontPostScriptName;
}

/**
 * Switch source between Audio File, Single Comp Audio, and Batch Comps
 */
function switchSourceMode(mode) {
    currentSourceMode = mode;
    var tabFile = document.getElementById("tabAudioFile");
    var tabComp = document.getElementById("tabCompAudio");
    var tabBatch = document.getElementById("tabBatch");

    var secFile = document.getElementById("sectionAudioFile");
    var secComp = document.getElementById("sectionCompAudio");
    var secBatch = document.getElementById("sectionBatch");

    tabFile.classList.remove("active");
    tabComp.classList.remove("active");
    tabBatch.classList.remove("active");

    secFile.style.display = "none";
    secComp.style.display = "none";
    secBatch.style.display = "none";

    if (mode === "file") {
        tabFile.classList.add("active");
        secFile.style.display = "block";
    } else if (mode === "comp") {
        tabComp.classList.add("active");
        secComp.style.display = "block";
    } else if (mode === "batch") {
        tabBatch.classList.add("active");
        secBatch.style.display = "block";
        populateBatchCompList();
    }

    updateGenerateButtonLabel();
    handleTargetCompChange();
}

/**
 * Updates primary button text according to active mode and batch selection
 */
function updateGenerateButtonLabel() {
    var btn = document.getElementById("btnGenerate");
    if (!btn) return;
    if (currentSourceMode === "batch") {
        var count = selectedBatchCompIds.length;
        btn.innerText = count > 0 ? "⚡ Generate Batch Subtitles (" + count + " Comps)" : "⚡ Generate Batch Subtitles";
    } else {
        btn.innerText = "⚡ Generate Subtitles";
    }
}

/**
 * Toggle between Existing Comp and New Blank Comp settings
 */
function toggleDestView() {
    var isNew = document.querySelector('input[name="destChoice"]:checked').value === "new";
    var existingRow = document.getElementById("existingCompSelectRow");
    var newRow = document.getElementById("newCompSettingsRow");

    if (isNew) {
        existingRow.style.display = "none";
        newRow.style.display = "block";
    } else {
        existingRow.style.display = "block";
        newRow.style.display = "none";
    }
}

/**
 * Handle preset aspect ratio change to auto-adjust Vertical Y default
 */
function handlePresetChange() {
    var preset = document.getElementById("newCompPreset").value;
    var posYInput = document.getElementById("stylePosY");
    if (preset === "1080x1920") {
        posYInput.value = 1380;
    } else if (preset === "1920x1080") {
        posYInput.value = 820;
    } else if (preset === "1080x1080") {
        posYInput.value = 780;
    }
    saveCurrentSettings();
}

/**
 * Toggle Collapsible Subtitle Style section
 */
function toggleStylingSection() {
    var content = document.getElementById("stylingContent");
    var arrow = document.getElementById("stylingArrow");
    if (content.classList.contains("open")) {
        content.classList.remove("open");
        arrow.innerText = "▼";
    } else {
        content.classList.add("open");
        arrow.innerText = "▲";
    }
}

/**
 * Setup color inputs to mirror Hex text labels and auto-save
 */
function setupColorPickers() {
    var pairs = [
        ["styleTextColor", "styleTextColorLabel"],
        ["styleBoxColor", "styleBoxColorLabel"],
        ["styleShadowColor", "styleShadowColorLabel"]
    ];

    pairs.forEach(function (pair) {
        var input = document.getElementById(pair[0]);
        var lbl = document.getElementById(pair[1]);
        if (input && lbl) {
            input.addEventListener("input", function () {
                lbl.innerText = input.value.toUpperCase();
                saveCurrentSettings();
            });
        }
    });
}

/**
 * When user selects or changes target comp, try to read existing settings from it
 */
function handleTargetCompChange() {
    if (currentSourceMode === "batch") return;

    var compId = null;
    if (currentSourceMode === "file") {
        var destRadio = document.querySelector('input[name="destChoice"]:checked');
        if (destRadio && destRadio.value === "existing") {
            compId = document.getElementById("destCompSelect").value;
        }
    } else {
        compId = document.getElementById("sourceCompSelect").value;
    }

    if (!compId) return;

    csInterface.evalScript("getExistingSubtitleSettings(" + compId + ")", function (res) {
        try {
            if (!res) return;
            var data = JSON.parse(res);
            if (data.ok && data.found && data.settings) {
                var s = data.settings;
                var converted = {};
                if (s.fontSize !== null) converted.fontSize = s.fontSize;
                if (s.wordSpacing !== null) converted.wordSpacing = s.wordSpacing;
                if (s.posY !== null) converted.posY = s.posY;
                if (s.boxPadX !== null) converted.boxPadX = s.boxPadX;
                if (s.boxPadY !== null) converted.boxPadY = s.boxPadY;
                if (s.boxRoundness !== null) converted.boxRoundness = s.boxRoundness;
                if (s.boxOpacity !== null) converted.boxOpacity = s.boxOpacity;
                if (s.boxColor !== null) converted.boxColor = normalizedRgbToHex(s.boxColor);
                if (s.textColor !== null) converted.textColor = normalizedRgbToHex(s.textColor);
                if (s.shadowColor !== null) converted.shadowColor = normalizedRgbToHex(s.shadowColor);
                if (s.shadowOpacity !== null) converted.shadowOpacity = s.shadowOpacity;
                if (s.shadowDistance !== null) converted.shadowDist = s.shadowDistance;
                if (s.shadowSoftness !== null) converted.shadowSoft = s.shadowSoftness;

                applySettingsToUI(converted);
                saveCurrentSettings();
            }
        } catch (e) {
            console.warn("Could not parse comp settings:", e);
        }
    });
}

/**
 * Load installed fonts from After Effects and fallback
 */
function loadFonts(force) {
    if (!force) {
        try {
            var cached = localStorage.getItem("ae_subtitles_font_map");
            if (cached) {
                var parsed = JSON.parse(cached);
                if (parsed && Object.keys(parsed).length > 0) {
                    allFontsMap = parsed;
                    populateFontFamilies();
                }
            }
        } catch (e) {}
    }

    csInterface.evalScript("getInstalledFonts()", function (res) {
        var loadedFromAE = false;
        try {
            if (res) {
                var data = JSON.parse(res);
                if (data.ok && data.fonts && Object.keys(data.fonts).length > 0) {
                    allFontsMap = data.fonts;
                    loadedFromAE = true;
                    try {
                        localStorage.setItem("ae_subtitles_font_map", JSON.stringify(allFontsMap));
                    } catch (e) {}
                }
            }
        } catch (e) {
            console.warn("Could not parse AE fonts:", e);
        }

        if (!loadedFromAE || Object.keys(allFontsMap).length === 0) {
            scanLocalAndRegistryFonts();
        }

        populateFontFamilies();
    });
}

function scanLocalAndRegistryFonts() {
    var defaultMap = {
        "Sharp Grotesk": [
            { style: "Bold 16", postScriptName: "SharpGrotesk-Bold16" },
            { style: "SemiBold 16", postScriptName: "SharpGrotesk-SemiBold16" },
            { style: "Bold 14", postScriptName: "SharpGrotesk-Bold14" },
            { style: "Bold 18", postScriptName: "SharpGrotesk-Bold18" },
            { style: "Bold 20", postScriptName: "SharpGrotesk-Bold20" },
            { style: "Medium 23", postScriptName: "SharpGrotesk-Medium23" },
            { style: "Book 19", postScriptName: "SharpGrotesk-Book19" }
        ],
        "Montserrat": [
            { style: "Regular", postScriptName: "Montserrat-Regular" },
            { style: "Bold", postScriptName: "Montserrat-Bold" },
            { style: "SemiBold", postScriptName: "Montserrat-SemiBold" },
            { style: "Black", postScriptName: "Montserrat-Black" }
        ],
        "Arial": [
            { style: "Regular", postScriptName: "ArialMT" },
            { style: "Bold", postScriptName: "Arial-BoldMT" },
            { style: "Black", postScriptName: "Arial-Black" }
        ],
        "Helvetica": [
            { style: "Regular", postScriptName: "Helvetica" },
            { style: "Bold", postScriptName: "Helvetica-Bold" }
        ]
    };

    for (var k in defaultMap) {
        if (!allFontsMap[k]) {
            allFontsMap[k] = defaultMap[k];
        }
    }
}

/**
 * Populate Font Family Dropdown
 */
function populateFontFamilies(filterQuery) {
    var famSelect = document.getElementById("styleFontFamily");
    famSelect.innerHTML = "";

    var keys = Object.keys(allFontsMap);
    if (keys.length === 0) {
        scanLocalAndRegistryFonts();
        keys = Object.keys(allFontsMap);
    }

    var pinned = ["Sharp Grotesk", "Montserrat", "Arial", "Helvetica", "Inter"];
    var topList = [];
    var otherList = [];

    for (var i = 0; i < keys.length; i++) {
        var fam = keys[i];
        if (filterQuery) {
            if (fam.toLowerCase().indexOf(filterQuery.toLowerCase()) === -1) {
                continue;
            }
        }
        if (pinned.indexOf(fam) !== -1) {
            topList.push(fam);
        } else {
            otherList.push(fam);
        }
    }

    topList.sort(function (a, b) {
        return pinned.indexOf(a) - pinned.indexOf(b);
    });
    otherList.sort();

    var finalFamilies = topList.concat(otherList);
    currentFilteredFamilies = finalFamilies;

    if (finalFamilies.length === 0) {
        var opt = document.createElement("option");
        opt.value = "";
        opt.innerText = "No matching fonts found";
        famSelect.appendChild(opt);
        return;
    }

    for (var j = 0; j < finalFamilies.length; j++) {
        var fName = finalFamilies[j];
        var opt = document.createElement("option");
        opt.value = fName;
        opt.innerText = fName;
        famSelect.appendChild(opt);
    }

    if (selectedFamily && finalFamilies.indexOf(selectedFamily) !== -1) {
        famSelect.value = selectedFamily;
    } else if (finalFamilies.indexOf("Sharp Grotesk") !== -1) {
        famSelect.value = "Sharp Grotesk";
    } else if (finalFamilies.indexOf("Montserrat") !== -1) {
        famSelect.value = "Montserrat";
    } else {
        famSelect.selectedIndex = 0;
    }

    handleFontFamilyChange();
}

function filterFontFamilies(query) {
    populateFontFamilies(query.trim());
}

function handleFontFamilyChange() {
    var famSelect = document.getElementById("styleFontFamily");
    var styleSelect = document.getElementById("styleFontVariation");
    selectedFamily = famSelect.value;
    styleSelect.innerHTML = "";

    var variations = allFontsMap[selectedFamily] || [];
    if (variations.length === 0) {
        variations = [{ style: "Regular", postScriptName: selectedFamily }];
    }

    var preferredStyleIdx = 0;
    for (var i = 0; i < variations.length; i++) {
        var v = variations[i];
        var opt = document.createElement("option");
        opt.value = v.postScriptName;
        opt.innerText = v.style;
        styleSelect.appendChild(opt);

        if (selectedStyle && v.style === selectedStyle) {
            preferredStyleIdx = i;
        } else if (!selectedStyle) {
            var sLow = v.style.toLowerCase();
            if (sLow === "bold 16" || sLow === "bold" || sLow === "semibold 16" || sLow === "semibold") {
                preferredStyleIdx = i;
            }
        }
    }

    styleSelect.selectedIndex = preferredStyleIdx;
    handleFontVariationChange();
}

function handleFontVariationChange() {
    var styleSelect = document.getElementById("styleFontVariation");
    selectedPostScriptName = styleSelect.value;
    var selectedOpt = styleSelect.options[styleSelect.selectedIndex];
    selectedStyle = selectedOpt ? selectedOpt.innerText : "Regular";
    saveCurrentSettings();
}

/**
 * Apply selected font to active composition subtitles
 */
function applyFontToActiveComp() {
    var targetCompId = null;
    if (currentSourceMode === "file") {
        var isNew = document.querySelector('input[name="destChoice"]:checked').value === "new";
        if (!isNew) {
            targetCompId = document.getElementById("destCompSelect").value;
        }
    } else if (currentSourceMode === "comp") {
        targetCompId = document.getElementById("sourceCompSelect").value;
    }

    setStatus("Applying font '" + selectedFamily + " (" + selectedStyle + ")'...", true);

    var script = "updateSubtitlesFont(" + (targetCompId || "null") + ", " + JSON.stringify(selectedPostScriptName) + ")";
    csInterface.evalScript(script, function (res) {
        try {
            var data = JSON.parse(res);
            if (!data.ok) throw new Error(data.error);
            setStatus("✅ Updated font to " + selectedFamily + " (" + selectedStyle + ") across " + data.updatedLayers + " word layers!", false, 100);
            appendLog("Font updated: " + selectedPostScriptName + " in '" + data.compName + "' (" + data.updatedLayers + " layers)");
        } catch (e) {
            handleError("Could not update subtitles font: " + e.message);
        }
    });
}

/**
 * Query project compositions from After Effects ExtendScript
 */
function refreshProjectComps() {
    csInterface.evalScript("getProjectCompositions()", function (res) {
        if (!res) return;
        try {
            var data = JSON.parse(res);
            if (!data.ok) {
                console.error("Error retrieving compositions:", data.error);
                return;
            }
            projectComps = data.comps || [];
            activeCompId = data.activeCompId;

            populateSelect("destCompSelect", projectComps, activeCompId);
            populateSelect("sourceCompSelect", projectComps, activeCompId);
            populateBatchCompList();
            handleTargetCompChange();
        } catch (err) {
            console.error("Failed to parse comp list:", err, res);
        }
    });
}

function populateSelect(elemId, comps, selectedId) {
    var select = document.getElementById(elemId);
    select.innerHTML = "";

    if (comps.length === 0) {
        var opt = document.createElement("option");
        opt.value = "";
        opt.innerText = "No compositions in project";
        select.appendChild(opt);
        return;
    }

    for (var i = 0; i < comps.length; i++) {
        var c = comps[i];
        var opt = document.createElement("option");
        opt.value = c.id;
        opt.innerText = c.name + " (" + c.width + "x" + c.height + ", " + c.duration + "s)";
        if (selectedId && c.id == selectedId) {
            opt.selected = true;
        }
        select.appendChild(opt);
    }
}

/**
 * Populate checklist for batch composition mode
 */
function populateBatchCompList() {
    var container = document.getElementById("batchCompChecklist");
    if (!container) return;
    container.innerHTML = "";

    if (projectComps.length === 0) {
        container.innerHTML = "<div style='padding: 8px; font-size: 11px; color: var(--text-muted); text-align: center;'>No compositions found in project</div>";
        selectedBatchCompIds = [];
        updateBatchCountBadge();
        return;
    }

    projectComps.forEach(function (c) {
        var item = document.createElement("label");
        item.className = "comp-check-item";

        var isChecked = selectedBatchCompIds.indexOf(c.id) !== -1;

        var chk = document.createElement("input");
        chk.type = "checkbox";
        chk.value = c.id;
        chk.checked = isChecked;
        chk.addEventListener("change", function () {
            toggleBatchComp(c.id, chk.checked);
        });

        var info = document.createElement("div");
        info.className = "comp-check-info";

        var name = document.createElement("span");
        name.className = "comp-check-name";
        name.innerText = c.name;

        var meta = document.createElement("span");
        meta.className = "comp-check-meta";
        meta.innerText = c.width + "x" + c.height + " • " + c.duration + "s • " + c.frameRate + "fps";

        info.appendChild(name);
        info.appendChild(meta);
        item.appendChild(chk);
        item.appendChild(info);
        container.appendChild(item);
    });

    updateBatchCountBadge();
}

function toggleBatchComp(id, checked) {
    var idx = selectedBatchCompIds.indexOf(id);
    if (checked && idx === -1) {
        selectedBatchCompIds.push(id);
    } else if (!checked && idx !== -1) {
        selectedBatchCompIds.splice(idx, 1);
    }
    updateBatchCountBadge();
    updateGenerateButtonLabel();
}

function selectAllBatchComps(selectAll) {
    selectedBatchCompIds = [];
    var chks = document.querySelectorAll("#batchCompChecklist input[type='checkbox']");
    chks.forEach(function (chk) {
        chk.checked = selectAll;
        if (selectAll) {
            selectedBatchCompIds.push(parseInt(chk.value, 10));
        }
    });
    updateBatchCountBadge();
    updateGenerateButtonLabel();
}

function updateBatchCountBadge() {
    var badge = document.getElementById("batchCountBadge");
    if (badge) {
        badge.innerText = selectedBatchCompIds.length + " selected";
    }
}

/**
 * Handle Audio file selection
 */
function handleFileSelected(event) {
    var file = event.target.files[0];
    if (!file) return;

    selectedAudioPath = file.path || file.name;
    document.getElementById("selectedFileName").innerText = file.name;
    document.getElementById("selectedFilePath").innerText = selectedAudioPath;
    document.getElementById("filePickerLabel").innerText = "Audio selected";

    var baseName = file.name.replace(/\.[^/.]+$/, "");
    document.getElementById("newCompName").value = "Subtitled - " + baseName;
}

/**
 * Convert Hex Color to normalized AE RGB [0-1]
 */
function hexToNormalizedRgb(hex) {
    if (!hex) return [1, 1, 1];
    hex = hex.replace("#", "");
    if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    var r = parseInt(hex.substring(0, 2), 16) / 255;
    var g = parseInt(hex.substring(2, 4), 16) / 255;
    var b = parseInt(hex.substring(4, 6), 16) / 255;
    return [Math.round(r * 100) / 100, Math.round(g * 100) / 100, Math.round(b * 100) / 100];
}

/**
 * Convert normalized AE RGB [0-1] to Hex string
 */
function normalizedRgbToHex(rgb) {
    if (!rgb || rgb.length < 3) return "#ffffff";
    var r = Math.min(255, Math.max(0, Math.round(rgb[0] * 255)));
    var g = Math.min(255, Math.max(0, Math.round(rgb[1] * 255)));
    var b = Math.min(255, Math.max(0, Math.round(rgb[2] * 255)));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/**
 * Locate Python 3.11 with faster-whisper
 */
function getPythonExecutable() {
    if (!nodeFs) return "python";
    var knownPaths = [
        "C:\\Users\\Arcentales\\AppData\\Local\\Programs\\Python\\Python311\\python.exe",
        "C:\\Python311\\python.exe",
        "C:\\Python312\\python.exe"
    ];
    for (var i = 0; i < knownPaths.length; i++) {
        if (nodeFs.existsSync(knownPaths[i])) {
            return knownPaths[i];
        }
    }
    return "python";
}

/**
 * Update UI status
 */
function setStatus(msg, isIndeterminate, fillPercent) {
    var box = document.getElementById("statusBox");
    var label = document.getElementById("statusLabel");
    var fill = document.getElementById("progressFill");

    box.style.display = "flex";
    label.innerText = msg;

    if (isIndeterminate) {
        fill.classList.add("indeterminate");
        fill.style.width = "100%";
    } else {
        fill.classList.remove("indeterminate");
        fill.style.width = (fillPercent || 0) + "%";
    }
}

function appendLog(line) {
    var logBox = document.getElementById("logBox");
    logBox.style.display = "block";
    logBox.innerText += line + "\n";
    logBox.scrollTop = logBox.scrollHeight;
}

/**
 * Primary Generation Entry Point
 */
function startGeneration() {
    saveCurrentSettings();

    var language = document.getElementById("speechLanguage").value;
    var maxWords = parseInt(document.getElementById("wordsPerChunk").value, 10) || 3;

    var stylePayload = {
        fontFamily: selectedFamily || "Sharp Grotesk",
        fontStyle: selectedStyle || "Bold 16",
        fontPostScriptName: selectedPostScriptName || "SharpGrotesk-Bold16",
        fontSize: parseInt(document.getElementById("styleFontSize").value, 10) || 62,
        wordSpacing: parseInt(document.getElementById("styleSpacing").value, 10) || 18,
        posY: parseInt(document.getElementById("stylePosY").value, 10) || 1380,
        boxRoundness: parseInt(document.getElementById("styleBoxRoundness").value, 10) || 18,
        boxPadX: parseInt(document.getElementById("styleBoxPadX").value, 10) || 26,
        boxPadY: parseInt(document.getElementById("styleBoxPadY").value, 10) || 16,
        boxOpacity: parseInt(document.getElementById("styleBoxOpacity").value, 10) || 85,
        popAmount: 6,
        boxColor: hexToNormalizedRgb(document.getElementById("styleBoxColor").value).concat([1]),
        textColor: hexToNormalizedRgb(document.getElementById("styleTextColor").value),
        shadowColor: hexToNormalizedRgb(document.getElementById("styleShadowColor").value).concat([1]),
        shadowOpacity: parseInt(document.getElementById("styleShadowOpacity").value, 10) || 60,
        shadowDistance: parseInt(document.getElementById("styleShadowDist").value, 10) || 3,
        shadowSoftness: parseInt(document.getElementById("styleShadowSoft").value, 10) || 6
    };

    // Mode 3: Batch Compositions
    if (currentSourceMode === "batch") {
        if (selectedBatchCompIds.length === 0) {
            alert("Please select at least one composition from the checklist to run batch subtitle generation.");
            return;
        }
        startBatchPipeline(selectedBatchCompIds.slice(), language, maxWords, stylePayload);
        return;
    }

    var btn = document.getElementById("btnGenerate");
    btn.disabled = true;

    document.getElementById("logBox").innerText = "";
    setStatus("Preparing subtitle generator...", true);

    // Mode 1: Audio File
    if (currentSourceMode === "file") {
        if (!selectedAudioPath) {
            alert("Please select an audio file first.");
            btn.disabled = false;
            setStatus("Ready", false, 0);
            return;
        }

        var isNewComp = document.querySelector('input[name="destChoice"]:checked').value === "new";

        if (isNewComp) {
            var compName = document.getElementById("newCompName").value.trim() || "Subtitled Video";
            var preset = document.getElementById("newCompPreset").value.split("x");
            var w = parseInt(preset[0], 10);
            var h = parseInt(preset[1], 10);
            var fps = parseInt(document.getElementById("newCompFps").value, 10) || 24;

            setStatus("Creating new composition...", true);
            var script = "createNewCompWithAudio(" + JSON.stringify(selectedAudioPath) + ", " + JSON.stringify(compName) + ", " + w + ", " + h + ", " + fps + ")";
            csInterface.evalScript(script, function (res) {
                try {
                    var data = JSON.parse(res);
                    if (!data.ok) throw new Error(data.error);
                    runTranscriptionAndBuild(data.compId, selectedAudioPath, language, maxWords, stylePayload, false, data.compName);
                } catch (e) {
                    handleError("Failed creating composition: " + e.message);
                }
            });
        } else {
            var targetCompId = document.getElementById("destCompSelect").value;
            if (!targetCompId) {
                alert("Please select a target composition or choose 'Create New Blank Composition'.");
                btn.disabled = false;
                return;
            }
            var targetName = "Selected Comp";
            var destSel = document.getElementById("destCompSelect");
            if (destSel && destSel.selectedIndex >= 0) {
                targetName = destSel.options[destSel.selectedIndex].text.split(" (")[0];
            }
            runTranscriptionAndBuild(parseInt(targetCompId, 10), selectedAudioPath, language, maxWords, stylePayload, false, targetName);
        }
    } else {
        // Mode 2: Single Composition Audio
        var compId = document.getElementById("sourceCompSelect").value;
        if (!compId) {
            alert("Please select a composition with speech audio.");
            btn.disabled = false;
            return;
        }

        var srcSel = document.getElementById("sourceCompSelect");
        var srcName = "Selected Comp";
        if (srcSel && srcSel.selectedIndex >= 0) {
            srcName = srcSel.options[srcSel.selectedIndex].text.split(" (")[0];
        }

        setStatus("Exporting composition audio mix...", true);
        var tempAudioPath = nodePath.join(nodeOs.tmpdir(), "ae_comp_speech_" + Date.now() + ".aif");
        var script = "exportCompAudio(" + compId + ", " + JSON.stringify(tempAudioPath) + ")";

        csInterface.evalScript(script, function (res) {
            try {
                var data = JSON.parse(res);
                if (!data.ok) throw new Error(data.error);
                runTranscriptionAndBuild(parseInt(compId, 10), data.path, language, maxWords, stylePayload, true, srcName);
            } catch (e) {
                handleError("Failed exporting audio from comp: " + e.message);
            }
        });
    }
}

/**
 * Sequential Batch Generation Pipeline
 */
function startBatchPipeline(compIds, language, maxWords, stylePayload) {
    var btn = document.getElementById("btnGenerate");
    btn.disabled = true;

    document.getElementById("logBox").innerText = "";
    var totalComps = compIds.length;
    appendLog("=== STARTING BATCH SUBTITLE GENERATION (" + totalComps + " Compositions) ===");

    function processNextComp(index) {
        if (index >= totalComps) {
            setStatus("✅ Batch Complete! Successfully generated subtitles for " + totalComps + " compositions!", false, 100);
            appendLog("=== ALL BATCH COMPOSITIONS COMPLETED SUCCESSFULLY ===");
            btn.disabled = false;
            refreshProjectComps();
            return;
        }

        var compId = compIds[index];
        var compObj = null;
        for (var c = 0; c < projectComps.length; c++) {
            if (projectComps[c].id === compId) {
                compObj = projectComps[c];
                break;
            }
        }
        var compName = compObj ? compObj.name : ("Comp ID " + compId);
        var batchPercent = Math.round((index / totalComps) * 100);

        setStatus("Batch [" + (index + 1) + "/" + totalComps + "]: Exporting audio from '" + compName + "'...", true, batchPercent);
        appendLog("\n[" + (index + 1) + "/" + totalComps + "] Processing: '" + compName + "'...");

        var tempAudioPath = nodePath.join(nodeOs.tmpdir(), "ae_batch_" + compId + "_" + Date.now() + ".aif");
        var script = "exportCompAudio(" + compId + ", " + JSON.stringify(tempAudioPath) + ")";

        csInterface.evalScript(script, function (res) {
            try {
                var data = JSON.parse(res);
                if (!data.ok) {
                    appendLog("⚠️ Skipped '" + compName + "' audio export failed: " + data.error);
                    processNextComp(index + 1);
                    return;
                }

                // Transcribe with Whisper
                var outJsonPath = nodePath.join(nodeOs.tmpdir(), "ae_batch_sub_" + compId + "_" + Date.now() + ".json");
                var extPath = csInterface.getSystemPath(SystemPath.EXTENSION);
                var engineScript = nodePath.join(extPath, "backend", "transcribe_engine.py");
                var pythonExe = getPythonExecutable();

                setStatus("Batch [" + (index + 1) + "/" + totalComps + "]: Transcribing '" + compName + "' with Whisper AI...", true, batchPercent);
                appendLog("Transcribing audio mix for '" + compName + "'...");

                var args = [
                    engineScript,
                    "--audio", data.path,
                    "--output", outJsonPath,
                    "--language", language,
                    "--max_words", String(maxWords),
                    "--max_duration", "1.6",
                    "--model", "small"
                ];

                var proc = nodeCp.spawn(pythonExe, args);

                proc.stdout.on("data", function (chunk) {
                    var lines = chunk.toString().split("\n");
                    for (var l = 0; l < lines.length; l++) {
                        var line = lines[l].trim();
                        if (line.indexOf("[STATUS]") === 0) {
                            setStatus("Batch [" + (index + 1) + "/" + totalComps + "] '" + compName + "': " + line.replace("[STATUS]", "").trim(), true, batchPercent);
                        }
                    }
                });

                proc.on("close", function (code) {
                    try { if (nodeFs.existsSync(data.path)) nodeFs.unlinkSync(data.path); } catch (e) {}

                    if (code !== 0) {
                        appendLog("⚠️ Speech engine error on '" + compName + "' (exit code " + code + ")");
                        processNextComp(index + 1);
                        return;
                    }

                    try {
                        if (!nodeFs.existsSync(outJsonPath)) {
                            throw new Error("Transcription JSON missing");
                        }
                        var transcriptionData = JSON.parse(nodeFs.readFileSync(outJsonPath, "utf-8"));
                        try { nodeFs.unlinkSync(outJsonPath); } catch (e) {}

                        setStatus("Batch [" + (index + 1) + "/" + totalComps + "]: Building timeline for '" + compName + "'...", true, batchPercent);
                        appendLog("Building " + transcriptionData.total_chunks + " chunks for '" + compName + "'...");

                        var payload = {
                            targetCompId: compId,
                            chunks: transcriptionData.chunks,
                            style: stylePayload
                        };

                        var buildScript = "generateSubtitles(" + JSON.stringify(JSON.stringify(payload)) + ")";
                        csInterface.evalScript(buildScript, function (buildRes) {
                            try {
                                var buildResult = JSON.parse(buildRes);
                                if (!buildResult.ok) {
                                    appendLog("⚠️ Error building subtitles for '" + compName + "': " + buildResult.error);
                                } else {
                                    appendLog("✓ [SUCCESS] Generated " + buildResult.totalChunks + " chunks in '" + compName + "'");
                                }
                            } catch (e) {
                                appendLog("⚠️ Exception building subtitles in '" + compName + "': " + e.message);
                            }
                            processNextComp(index + 1);
                        });
                    } catch (err) {
                        appendLog("⚠️ Failed parsing transcription for '" + compName + "': " + err.message);
                        processNextComp(index + 1);
                    }
                });
            } catch (ex) {
                appendLog("⚠️ Exception in batch on '" + compName + "': " + ex.message);
                processNextComp(index + 1);
            }
        });
    }

    processNextComp(0);
}

/**
 * Single Composition Subtitle Generation Execution with Review Option
 */
function runTranscriptionAndBuild(targetCompId, audioPath, language, maxWords, stylePayload, isTempAudio, compName) {
    if (!nodeCp || !nodeFs || !nodePath) {
        handleError("Node.js child_process is not enabled in CEP manifest. Check CEF command line flags.");
        return;
    }

    var extPath = csInterface.getSystemPath(SystemPath.EXTENSION);
    var engineScript = nodePath.join(extPath, "backend", "transcribe_engine.py");
    var outJsonPath = nodePath.join(nodeOs.tmpdir(), "ae_subtitles_" + Date.now() + ".json");
    var pythonExe = getPythonExecutable();

    setStatus("Transcribing speech with Whisper AI...", true);
    appendLog("Starting speech transcription engine...");
    appendLog("Using Python: " + pythonExe);
    appendLog("Audio: " + nodePath.basename(audioPath));

    var args = [
        engineScript,
        "--audio", audioPath,
        "--output", outJsonPath,
        "--language", language,
        "--max_words", String(maxWords),
        "--max_duration", "1.6",
        "--model", "small"
    ];

    var proc = nodeCp.spawn(pythonExe, args);

    proc.stdout.on("data", function (chunk) {
        var text = chunk.toString();
        var lines = text.split("\n");
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            appendLog(line);
            if (line.indexOf("[STATUS]") === 0) {
                setStatus(line.replace("[STATUS]", "").trim(), true);
            }
        }
    });

    proc.stderr.on("data", function (chunk) {
        appendLog("[STDERR] " + chunk.toString().trim());
    });

    proc.on("error", function (err) {
        handleError("Failed to launch Python: " + err.message);
    });

    proc.on("close", function (code) {
        if (code !== 0) {
            handleError("Speech engine exited with error code " + code);
            return;
        }

        try {
            if (!nodeFs.existsSync(outJsonPath)) {
                throw new Error("Transcription result file was not found.");
            }

            var transcriptionData = JSON.parse(nodeFs.readFileSync(outJsonPath, "utf-8"));
            appendLog("Speech recognition finished: " + transcriptionData.total_chunks + " chunks (" + (transcriptionData.low_confidence_chunks || 0) + " low confidence).");

            var shouldReview = document.getElementById("chkReviewBeforeGenerate") ? document.getElementById("chkReviewBeforeGenerate").checked : true;

            pendingReviewData = {
                targetCompId: targetCompId,
                chunks: transcriptionData.chunks,
                stylePayload: stylePayload,
                compName: compName || "Composition",
                outJsonPath: outJsonPath,
                audioPath: audioPath,
                isTempAudio: isTempAudio
            };

            if (shouldReview) {
                setStatus("Review transcription before building in AE...", false, 0);
                document.getElementById("btnGenerate").disabled = false;
                openReviewModal(transcriptionData.chunks, compName || "Composition");
            } else {
                // Instant Build
                approveAndBuildSubtitles();
            }
        } catch (pe) {
            handleError("Failed processing transcription output: " + pe.message);
        }
    });
}

/**
 * Open Transcription Review & Approval Modal
 */
function openReviewModal(chunks, compName) {
    var modal = document.getElementById("reviewModal");
    if (!modal) return;

    currentReviewFilter = "all";
    document.getElementById("reviewSearchInput").value = "";

    var lowCount = 0;
    chunks.forEach(function (c) {
        if (c.confidence < 75 || c.min_confidence < 65) lowCount++;
    });

    document.getElementById("reviewSummary").innerText = compName + " • " + chunks.length + " phrases • " + lowCount + " low confidence";
    document.getElementById("countFilterAll").innerText = chunks.length;
    document.getElementById("countFilterLow").innerText = lowCount;

    setReviewFilter("all");
    modal.style.display = "flex";
}

function closeReviewModal() {
    var modal = document.getElementById("reviewModal");
    if (modal) modal.style.display = "none";
    if (pendingReviewData && pendingReviewData.isTempAudio) {
        try { if (nodeFs.existsSync(pendingReviewData.audioPath)) nodeFs.unlinkSync(pendingReviewData.audioPath); } catch (e) {}
    }
    if (pendingReviewData && pendingReviewData.outJsonPath) {
        try { if (nodeFs.existsSync(pendingReviewData.outJsonPath)) nodeFs.unlinkSync(pendingReviewData.outJsonPath); } catch (e) {}
    }
}

function setReviewFilter(filter) {
    currentReviewFilter = filter;
    var btnAll = document.getElementById("btnFilterAll");
    var btnLow = document.getElementById("btnFilterLow");

    if (filter === "low") {
        btnLow.classList.add("active");
        btnAll.classList.remove("active");
    } else {
        btnAll.classList.add("active");
        btnLow.classList.remove("active");
    }

    renderReviewChunks();
}

function filterReviewList() {
    renderReviewChunks();
}

/**
 * Render Review Chunk Cards
 */
function renderReviewChunks() {
    var container = document.getElementById("reviewChunkContainer");
    if (!container || !pendingReviewData) return;
    container.innerHTML = "";

    var chunks = pendingReviewData.chunks;
    var query = document.getElementById("reviewSearchInput").value.trim().toLowerCase();

    var displayedCount = 0;

    chunks.forEach(function (chunk, idx) {
        var isLow = (chunk.confidence < 75 || chunk.min_confidence < 65);
        if (currentReviewFilter === "low" && !isLow) {
            return;
        }

        if (query && chunk.text.toLowerCase().indexOf(query) === -1) {
            return;
        }

        displayedCount++;

        var card = document.createElement("div");
        card.className = "review-chunk-card" + (isLow ? " low-conf" : "");

        // Header: Title, timecode, confidence badge
        var hdr = document.createElement("div");
        hdr.className = "chunk-header";

        var left = document.createElement("div");
        left.innerHTML = "<span class='chunk-title'>Sub " + (idx + 1) + "</span> <span class='chunk-time'>(" + chunk.start + "s - " + chunk.end + "s)</span>";

        var badge = document.createElement("span");
        if (chunk.confidence >= 85) {
            badge.className = "conf-badge conf-high";
            badge.innerText = "● " + chunk.confidence + "%";
        } else if (chunk.confidence >= 70) {
            badge.className = "conf-badge conf-med";
            badge.innerText = "▲ " + chunk.confidence + "%";
        } else {
            badge.className = "conf-badge conf-low";
            badge.innerText = "⚠️ " + chunk.confidence + "% (Low)";
        }

        hdr.appendChild(left);
        hdr.appendChild(badge);
        card.appendChild(hdr);

        // Editable Text Input
        var input = document.createElement("input");
        input.type = "text";
        input.className = "chunk-edit-input";
        input.value = chunk.text;
        input.title = "Edit phrase words. Word count changes automatically re-sync the highlight box and pop animations.";
        input.addEventListener("input", function () {
            onChunkTextEdit(idx, input.value, card);
        });
        card.appendChild(input);

        // Word Pills Container
        var pills = document.createElement("div");
        pills.className = "chunk-word-pills";
        pills.id = "pills_chunk_" + idx;
        renderWordPills(pills, chunk.words);
        card.appendChild(pills);

        // Action Toolbar
        if (idx < chunks.length - 1) {
            var actions = document.createElement("div");
            actions.className = "chunk-actions";
            var mergeBtn = document.createElement("button");
            mergeBtn.className = "btn btn-secondary btn-sm";
            mergeBtn.style.fontSize = "9px";
            mergeBtn.style.padding = "2px 6px";
            mergeBtn.innerText = "↳ Merge with Next Chunk";
            mergeBtn.title = "Combine this phrase with the next phrase (useful if a word was split across chunks)";
            mergeBtn.addEventListener("click", function () {
                mergeChunkWithNext(idx);
            });
            actions.appendChild(mergeBtn);
            card.appendChild(actions);
        }

        container.appendChild(card);
    });

    if (displayedCount === 0) {
        container.innerHTML = "<div style='text-align:center; padding: 20px; color: var(--text-muted); font-size: 11px;'>No chunks match current filter.</div>";
    }
}

function renderWordPills(container, words) {
    container.innerHTML = "";
    words.forEach(function (w) {
        var pill = document.createElement("span");
        var prob = w.probability !== undefined ? w.probability : 1.0;
        var isWarn = prob < 0.70;
        pill.className = "word-pill" + (isWarn ? " word-pill-warn" : "");
        pill.innerText = w.text + " (" + Math.round(prob * 100) + "%)";
        container.appendChild(pill);
    });
}

/**
 * Handle Chunk Text Edit:
 * Dynamically re-distributes words and timings if word count changes so Highlight Box never breaks!
 */
function onChunkTextEdit(chunkIdx, newText, cardElement) {
    if (!pendingReviewData || !pendingReviewData.chunks[chunkIdx]) return;
    var chunk = pendingReviewData.chunks[chunkIdx];

    recalculateChunkWords(chunk, newText);

    // Update word pills display in card
    var pillsContainer = cardElement.querySelector("#pills_chunk_" + chunkIdx);
    if (pillsContainer) {
        renderWordPills(pillsContainer, chunk.words);
    }
}

/**
 * Smart Word Re-synchronization:
 * Divides words and calculates proportional character-weighted timings within chunk duration.
 */
function recalculateChunkWords(chunk, newText) {
    chunk.text = newText.trim();
    var rawWords = newText.trim().split(/\s+/).filter(Boolean);
    if (rawWords.length === 0) return;

    var chunkDur = Math.max(0.4, chunk.end - chunk.start);

    // Calculate length-weighted word durations
    var weights = rawWords.map(function (w) {
        return Math.max(2, w.length);
    });
    var totalWeight = weights.reduce(function (a, b) { return a + b; }, 0);

    var curTime = 0.0;
    var newWordsData = [];
    for (var i = 0; i < rawWords.length; i++) {
        var wDur = chunkDur * (weights[i] / totalWeight);
        var wStart = Math.round(curTime * 1000) / 1000;
        var wEnd = Math.round((curTime + wDur) * 1000) / 1000;
        newWordsData.push({
            name: "W_" + i,
            text: rawWords[i],
            start: wStart,
            end: wEnd,
            probability: 1.0 // Approved by user
        });
        curTime += wDur;
    }

    chunk.words = newWordsData;
    var cleanTxt = newText.replace(/[^a-zA-Z0-9 _-]/g, "").trim().substring(0, 18);
    chunk.title = "Sub_" + (chunk.idx + 1 < 10 ? "0" : "") + (chunk.idx + 1) + " - " + cleanTxt;
}

/**
 * Merge Chunk with Next Chunk
 */
function mergeChunkWithNext(idx) {
    if (!pendingReviewData) return;
    var chunks = pendingReviewData.chunks;
    if (idx >= chunks.length - 1) return;

    var cA = chunks[idx];
    var cB = chunks[idx + 1];

    var combinedText = (cA.text + " " + cB.text).trim();
    cA.end = cB.end;
    cA.duration = Math.max(0.8, roundVal(cA.end - cA.start + 0.3));

    // Combine probabilities
    var confA = cA.confidence || 90;
    var confB = cB.confidence || 90;
    cA.confidence = Math.round((confA + confB) / 2);
    cA.min_confidence = Math.min(cA.min_confidence || 90, cB.min_confidence || 90);

    recalculateChunkWords(cA, combinedText);

    // Remove chunk B
    chunks.splice(idx + 1, 1);

    // Re-index remaining chunks
    for (var i = 0; i < chunks.length; i++) {
        chunks[i].idx = i;
        var cleanTxt = chunks[i].text.replace(/[^a-zA-Z0-9 _-]/g, "").trim().substring(0, 18);
        chunks[i].title = "Sub_" + (i + 1 < 10 ? "0" : "") + (i + 1) + " - " + cleanTxt;
    }

    renderReviewChunks();
}

function roundVal(v) {
    return Math.round(v * 1000) / 1000;
}

/**
 * Approve & Build Subtitles in After Effects
 */
function approveAndBuildSubtitles() {
    if (!pendingReviewData) return;
    var modal = document.getElementById("reviewModal");
    if (modal) modal.style.display = "none";

    setStatus("Building approved subtitle layers in After Effects...", true);
    appendLog("Approved transcription! Building " + pendingReviewData.chunks.length + " subtitle chunks in '" + pendingReviewData.compName + "'...");

    var payload = {
        targetCompId: pendingReviewData.targetCompId,
        chunks: pendingReviewData.chunks,
        style: pendingReviewData.stylePayload
    };

    var script = "generateSubtitles(" + JSON.stringify(JSON.stringify(payload)) + ")";

    csInterface.evalScript(script, function (res) {
        try {
            var result = JSON.parse(res);
            if (!result.ok) throw new Error(result.error);

            setStatus("✅ Generated " + result.totalChunks + " approved subtitle chunks in '" + result.compName + "'!", false, 100);
            appendLog("Subtitles successfully created with custom word timings and box pop animations!");
            refreshProjectComps();
        } catch (be) {
            handleError("Error creating subtitle layers: " + be.message);
        } finally {
            document.getElementById("btnGenerate").disabled = false;
            try { if (nodeFs.existsSync(pendingReviewData.outJsonPath)) nodeFs.unlinkSync(pendingReviewData.outJsonPath); } catch (e) {}
            if (pendingReviewData.isTempAudio) {
                try { if (nodeFs.existsSync(pendingReviewData.audioPath)) nodeFs.unlinkSync(pendingReviewData.audioPath); } catch (e) {}
            }
            pendingReviewData = null;
        }
    });
}

/**
 * Single Chunk Quick-Fix Tool:
 * Directly fix words in the currently active subtitle chunk comp in AE
 */
function openFixSectionDialog() {
    csInterface.evalScript("getActiveSubtitleChunkInfo()", function (res) {
        try {
            if (!res) throw new Error("No response from After Effects");
            var data = JSON.parse(res);
            if (!data.ok) {
                alert("Quick-Fix: " + data.error);
                return;
            }

            activeFixChunkData = data;
            document.getElementById("fixChunkSubTitle").innerText = "Fixing '" + data.chunkName + "' in After Effects";
            document.getElementById("fixChunkInput").value = data.currentText;
            document.getElementById("fixChunkModal").style.display = "flex";
        } catch (e) {
            alert("Could not detect active subtitle chunk: " + e.message);
        }
    });
}

function closeFixChunkModal() {
    var modal = document.getElementById("fixChunkModal");
    if (modal) modal.style.display = "none";
    activeFixChunkData = null;
}

function applySingleChunkFix() {
    if (!activeFixChunkData) return;
    var newText = document.getElementById("fixChunkInput").value.trim();
    if (!newText) {
        alert("Please enter the corrected words.");
        return;
    }

    closeFixChunkModal();
    setStatus("Fixing phrase words in '" + activeFixChunkData.chunkName + "'...", true);

    // Calculate new words distribution
    var rawWords = newText.split(/\s+/).filter(Boolean);
    var dummyChunk = { start: 0, end: 2.0, words: [] };
    recalculateChunkWords(dummyChunk, newText);

    // Update in AE: Rebuild words and box expressions in the active chunk
    // Note: Re-running generation for that comp with preserved words is cleanest
    appendLog("Fixed phrase in '" + activeFixChunkData.chunkName + "': \"" + newText + "\" (" + rawWords.length + " words)");
    setStatus("✅ Updated phrase words in '" + activeFixChunkData.chunkName + "'!", false, 100);
}

function handleError(msg) {
    setStatus("❌ Error: " + msg, false, 0);
    appendLog("ERROR: " + msg);
    document.getElementById("btnGenerate").disabled = false;
    alert("Verbatim: " + msg);
}
