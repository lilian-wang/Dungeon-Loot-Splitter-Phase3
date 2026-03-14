
/*-------------------------- 
  Application State
  --------------------------*/
// Global loot array that persists across the entire application
// Each loot item is stored an object with: { lootName, lootValue, lootRarity }
let loot = [];

// Current party size
let partySize = 1;

/*-------------------------- 
  Constants
  --------------------------*/
const STORAGE_KEY = "lootSplitterState";

// Rarity multipliers that modify final value
const RarityMultiplier = Object.freeze({
    common: 1.0,
    uncommon: 1.2,
    rare: 1.5,
    epic: 2.0,
    legendary: 3.0
});

const GuildTaxThreshold = 1000;
const GuildTaxRate = 0.10;

/*-------------------------- 
  DOM references
  --------------------------*/
const DOM = {
    partySize: document.getElementById('partySize'),
    partyError: document.getElementById('partyError'),
    nameInput: document.getElementById('lootName'),
    valueInput: document.getElementById('lootValue'),
    quantityInput: document.getElementById('lootQuantity'),
    raritySelect: document.getElementById('lootRarity'),
    lootError: document.getElementById('lootError'),
    splitBtn: document.getElementById('splitBtn'),
    splitError: document.getElementById('splitError'),
    result: document.getElementById('result'),
    totalLootDiv: document.getElementById('totalLoot'),
    noLootMsg: document.getElementById('noLootMessage'),
    lootRows: document.getElementById('lootRows')
};

/*-------------------------- 
  Helpers
  --------------------------*/
// Format a number as currency with two decimal places
function money(n) {
    return Number(n).toFixed(2);
}

// Render the loot list dynamically using a loop
function renderLoot(renderData) {
    DOM.lootRows.innerHTML = '';

    // Empty loot case
    if (renderData.length === 0) {
        DOM.noLootMsg.classList.remove('hidden');
    } else {
        DOM.noLootMsg.classList.add('hidden');

        // Build a list dynamically
        // Create .loot-row and .loot-cell elements
        for (let i = 0; i < renderData.length; i++) {
            const { lootName, lootValue, lootQuantity, lootRarity, finalValue, isNew } = renderData[i];
            const Row = document.createElement('div');
            const NameCell = document.createElement('div');
            const NameLine = document.createElement('div');
            const RarityLine = document.createElement('div');
            const ValueCell = document.createElement('div');
            const BaseLine = document.createElement('div');
            const FinalLine = document.createElement('div');
            const QuantityCell = document.createElement('div');
            const ActionCell = document.createElement('div');
            const RemoveBtn = document.createElement('button');

            // Capitalize rarity for display purposes
            const Rarity = lootRarity.charAt(0).toUpperCase() + lootRarity.slice(1);

            Row.className = `loot-row collapse-up rarity-${lootRarity}`;

            // If this is the newly added loot, animate it
            if (isNew) {
                Row.classList.add('fade-in');
            }
            
            NameCell.className = `loot-cell loot-name-cell`;
            NameLine.className = `loot-name`;
            NameLine.innerText = lootName;
            RarityLine.className = 'loot-rarity';
            RarityLine.innerText = Rarity;
            
            ValueCell.className = 'loot-cell loot-value-cell';
            BaseLine.classList = 'loot-value-base';
            BaseLine.innerText = `Base: ${money(lootValue)}`;
            FinalLine.classList = 'loot-value-final';
            FinalLine.innerText = `Final: ${money(finalValue)}`;
            
            QuantityCell.className = 'loot-cell loot-quantity-cell';
            QuantityCell.innerText = lootQuantity;
            
            ActionCell.className = 'loot-cell loot-remove-cell loot-actions';
            
            RemoveBtn.className = 'remove-btn';
            RemoveBtn.innerText = 'Remove';
            RemoveBtn.setAttribute('aria-label', `Remove ${lootName} from loot list`);
            RemoveBtn.addEventListener('click', function () {
                removeLoot(i);
            });

            // Stack name + rarity
            NameCell.appendChild(NameLine);
            NameCell.appendChild(RarityLine);

            // Stack base + value
            ValueCell.appendChild(BaseLine);
            ValueCell.appendChild(FinalLine);
            
            ActionCell.appendChild(RemoveBtn);

            // Append cells to row
            Row.appendChild(NameCell);
            Row.appendChild(ValueCell);
            Row.appendChild(QuantityCell);
            Row.appendChild(ActionCell);

            DOM.lootRows.appendChild(Row);
        }
    }
}

/*-------------------------- 
  Core Functions
  --------------------------*/
// Read the Storage information and write it to JSON
function restoreState() {
    let state = {};
    let restoredPartySize = 1;
    const restoredLoot = [];

    try {
        state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    }
    catch {
        // ignore corrupted storage
    }

    if (Array.isArray(state.loot)) {
        state.loot.forEach(item => {
            if (typeof item.lootName === 'string' && item.lootName.trim() !== '' 
                && !isNaN(item.lootValue) && item.lootValue >= 0 
                && !isNaN(item.lootQuantity) && item.lootQuantity >= 1) {
                    restoredLoot.push(item);
                }
        });
    }

    restoredPartySize = 
        typeof state.partySize === 'number' && state.partySize > 0 
        ? state.partySize : restoredPartySize;

    return {
        loot: restoredLoot,
        partySize: restoredPartySize
    }
}

// Save the State information to the Storage information
function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ loot, partySize }));
}

// Clear the State information and remove the Storage information
function resetState() {
    loot = [];
    partySize = 1;
    localStorage.removeItem(STORAGE_KEY);
    DOM.partySize.value = 1;
    updateUI();
}

// Remove a loot
function removeLoot(i) {
    const row = DOM.lootRows.children[i];

    // Collapse the row
    row.classList.add('collapsing');

    // Wait for collapse animation, then remove loot
    setTimeout(() => {
        loot.splice(i, 1);
        saveState();
        updateUI();
    }, 250)
}

// Perform all rendering and all total calculation
function updateUI() {
    let totalLoot = 0;
    let totalAfterTax = 0;
    let guildTax = 0;
    let validState = true;
    let totalHtml = '';
    let renderData = [];

    DOM.splitBtn.disabled = true;
    DOM.splitError.textContent = '';
    DOM.result.classList.add('hidden');
    DOM.totalLootDiv.classList.add('hidden');

    //-------------------------------
    // 1. Calculate totals
    //-------------------------------
    // Loop through all loot items and accumulate their final values
    for (let i = 0; i < loot.length; i++) {
        totalLoot += loot[i].lootValue * loot[i].lootQuantity * (RarityMultiplier[loot[i].lootRarity] ?? 1);
    }

    // Apply guild tax only if total exceeds the threshold
    if (totalLoot > GuildTaxThreshold) {
        guildTax = totalLoot * GuildTaxRate;
    }

    // Final total after tax deduction
    totalAfterTax = totalLoot - guildTax;

    //-------------------------------
    // 2. Render loot list
    //-------------------------------
    renderData = loot.map(item => ({
        ...item,
        finalValue: item.lootValue * (RarityMultiplier[item.lootRarity] ?? 1)
    }));

    renderLoot(renderData);

    // Update the running total
    totalHtml = `Total Loot: $${money(totalLoot)}`;

    if (guildTax > 0) {
        totalHtml += `
            <br>Guild Tax Applied: $${money(guildTax)}
            <br>Remaining Total: $${money(totalAfterTax)}
        `;
    }

    //-------------------------------
    // 3. Enable/disable Split button
    //-------------------------------
    validState = partySize > 0 && loot.length > 0;
    DOM.splitBtn.disabled = !validState;

    //-------------------------------
    // 4. Show/hide results
    //-------------------------------
    // Show the party size
    DOM.partySize.value = partySize;
    
    if (loot.length === 0) {
        let splitError = 'No loot to split.'

        DOM.splitError.textContent = splitError;
    } else {
        // Show the running total
        DOM.totalLootDiv.innerHTML = totalHtml;
        DOM.totalLootDiv.classList.remove('hidden');
        
        // Show the split results
        if (validState) {
            const Html = `
                Total Loot: $${money(totalAfterTax)}<br>
                Loot Per Party Member: $${money(totalAfterTax/partySize)}<br>
            `;

            DOM.result.innerHTML = Html; 
            DOM.result.classList.remove('hidden');
        }
    }
}

// Add a new loot with full validation
function addLoot() {
    let error = '';

    // Read all form fields
    const Name = DOM.nameInput.value.trim();
    const Value = parseFloat(DOM.valueInput.value.trim());
    const Quantity = parseInt(DOM.quantityInput.value.trim(), 10);
    const Rarity = DOM.raritySelect.value;

    // Validation for required fields
    if (Name === '') {
        error = 'Loot name cannot be empty.';
    } else if (isNaN(Value) || Value < 0) {
        error = 'Loot value must be greater than or equal to 0.'
    } else if (isNaN(Quantity) || Quantity < 1) {
        error = 'Loot quantity must be at least 1.';
    }

    if (error !== '') {
        DOM.lootError.textContent = error;
    } else {
        // Push a new loot object into the localStorage
        loot.push({
            lootName: Name, 
            lootValue: Value, 
            lootQuantity: Quantity,
            lootRarity: Rarity,
            isNew: true // Flag for animation
        });

        // Save entire object back
        saveState();

        // Reset form fields
        DOM.nameInput.value = '';
        DOM.valueInput.value = '';
        DOM.quantityInput.value = 1;
        DOM.raritySelect.value = 'common';

        DOM.lootError.textContent = '';

        // Automatically re-render the list, update totals, and recalculate split when loot changes
        updateUI();

        // After first render, remove isNew flag so future updates don't animate
        loot.forEach(item => delete item.isNew);
    }
}

/*-------------------------- 
  Initialize page behavior
  --------------------------*/
document.addEventListener('DOMContentLoaded', () => {
    // Restore state from localStorage
    const state = restoreState();

    loot = state.loot;
    partySize = state.partySize;

    updateUI();

    DOM.partySize.addEventListener('input', function (e) {
        let error = '';

        partySize = Number(e.target.value);

        if (isNaN(partySize) || partySize < 1) {
            error = 'Party size must be at least 1.';
        } else {
            saveState();
        }
        
        DOM.partyError.textContent = error;

        updateUI();
    });

    // Add Loot button: prevent page reload and call addLoot()
    document.getElementById('lootForm').addEventListener('submit', function(e) {
        e.preventDefault();
        addLoot();
    });

    // To be deprecated: UI is automatically updated to state change
    // Split Loot button
    document.getElementById('splitBtn').addEventListener('click', updateUI);

    document.getElementById('resetBtn').addEventListener('click', resetState);
});