const YEAR_LABELS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

function defaultYearConfig() {
    return {
        scheduleMode: 'class',
        sectionsPerCluster: 2,
        departments: [{ name: '', sections: 1 }],
        subjects: [{ name: '', type: 'THEORY', hours: 3, lab_duration: 2 }],
        labs: [{ lab_id: 'LAB-1', lab_name: '', room_number: '' }],
        activeLabSection: '',
        labBlocks: [],
        labAssignments: [],
        teachers: [{ id: '', name: '', cluster: 1, max_consecutive_classes: 2, availabilityText: '' }],
        sectionSubjectTeacherMap: {},
        classrooms: {},
        constraints: { enforceFirstPeriod: true, maxConsecutiveClasses: 2 },
    };
}

const state = {
    currentStep: 0,
    // Multi-year
    selectedYears: [1], // which years are enabled (1-indexed)
    activeYear: 1,      // which year tab is currently being edited
    yearConfigs: { 1: defaultYearConfig() },
    numDays: 5,
    numSlots: 6,
    draggingLabBlockId: '',
    selectedLabBlockId: '',  // for click-to-assign
    retrySeed: null,
    lastGenerationError: '',
    results: null,
};

// Shortcut to get active year config
function yc() { return state.yearConfigs[state.activeYear]; }

// Proxy getters that read from active year config
function getScheduleMode() { return yc().scheduleMode; }

const STEPS = [
    { label: 'Years', icon: '🎓' },
    { label: 'Setup', icon: '⚙️' },
    { label: 'Subjects', icon: '📚' },
    { label: 'Lab Rooms', icon: '🧪' },
    { label: 'Lab Grid', icon: '🧩' },
    { label: 'Professor Map', icon: '👩‍🏫' },
    { label: 'Classrooms', icon: '🏫' },
    { label: 'Generate', icon: '🚀' },
];

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function getNumClusters() {
    if (yc().scheduleMode !== 'cluster') return 1;
    const totalSections = getSections().length;
    return Math.max(1, Math.ceil(totalSections / Math.max(1, yc().sectionsPerCluster)));
}

function getClusterForSection(section) {
    if (yc().scheduleMode !== 'cluster') return 1;
    const sections = getSections();
    const idx = sections.indexOf(section);
    if (idx < 0) return 1;
    return Math.floor(idx / Math.max(1, yc().sectionsPerCluster)) + 1;
}

function getTeacherIdForSectionSubject(section, subject) {
    const key = `${section}::${subject}`;
    return yc().sectionSubjectTeacherMap[key] || '';
}

document.addEventListener('DOMContentLoaded', () => {
    renderStepper();
    renderStep();
});

function renderStepper() {
    const stepper = document.getElementById('stepper');
    stepper.innerHTML = '';
    STEPS.forEach((step, i) => {
        const item = document.createElement('div');
        item.className = `step-item ${i === state.currentStep ? 'active' : ''} ${i < state.currentStep ? 'completed' : ''}`;
        if (i < state.currentStep) {
            item.onclick = () => {
                state.currentStep = i;
                renderStepper();
                renderStep();
            };
        }
        item.innerHTML = `<div class="step-circle"><span class="step-number">${i + 1}</span></div><span class="step-label">${step.label}</span>`;
        stepper.appendChild(item);
        if (i < STEPS.length - 1) {
            const connector = document.createElement('div');
            connector.className = `step-connector ${i < state.currentStep ? 'completed' : ''}`;
            stepper.appendChild(connector);
        }
    });
}

function renderStep() {
    const card = document.getElementById('wizardCard');
    const routes = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6, renderStep7];
    routes[state.currentStep](card);
}

// ─── Year Tab Bar (shown on steps 1-6) ─────────────────────
function renderYearTabs() {
    if (state.selectedYears.length <= 1) return '';
    return `
        <div class="year-tabs" style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;">
            ${state.selectedYears.map(y => `
                <button class="btn ${state.activeYear === y ? 'btn-primary' : 'btn-secondary'} btn-small year-tab-btn" data-year="${y}" onclick="switchYear(${y})">
                    🎓 ${YEAR_LABELS[y-1]}
                </button>
            `).join('')}
        </div>
    `;
}

function switchYear(y) {
    state.activeYear = y;
    renderStep();
}

// ─── Step 0: Year Selection ──────────────────────────────────
function renderStep0(card) {
    card.innerHTML = `
        <div class="step-header">
            <span class="step-badge">🎓 Step 1 of ${STEPS.length}</span>
            <h2>Select Years</h2>
            <p>Choose which years you want to generate timetables for. Each year will have its own subjects, professors, and sections. Shared professors won't get conflicting slots.</p>
        </div>

        <div class="form-grid">
            <div class="form-group">
                <label>Number of Working Days <span class="required">*</span></label>
                <input type="number" class="form-input" id="numDays" min="1" max="7"
                    value="${state.numDays}" placeholder="e.g. 5">
            </div>
            <div class="form-group">
                <label>Time Slots per Day <span class="required">*</span></label>
                <input type="number" class="form-input" id="numSlots" min="1" max="12"
                    value="${state.numSlots}" placeholder="e.g. 6">
            </div>
        </div>

        <div class="entries-container" style="margin-top:24px;">
            ${YEAR_LABELS.map((label, i) => {
                const yearNum = i + 1;
                const isSelected = state.selectedYears.includes(yearNum);
                return `
                    <div class="entry-card year-select-card ${isSelected ? 'year-active' : ''}" onclick="toggleYear(${yearNum})" style="cursor:pointer;padding:16px 20px;display:flex;align-items:center;gap:14px;border-color:${isSelected ? 'var(--accent-primary)' : 'var(--border)'};background:${isSelected ? 'var(--accent-glow)' : 'var(--bg-input)'};">
                        <div style="width:28px;height:28px;border-radius:6px;border:2px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border)'};display:flex;align-items:center;justify-content:center;background:${isSelected ? 'var(--accent-primary)' : 'transparent'};color:white;font-size:0.8rem;flex-shrink:0;">${isSelected ? '✓' : ''}</div>
                        <div>
                            <div style="font-weight:600;color:var(--text-primary);font-size:1rem;">🎓 ${label}</div>
                            <div style="font-size:0.82rem;color:var(--text-muted);">Configure departments, subjects & professors for ${label.toLowerCase()}</div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>

        ${renderWizardActions(false, true)}
    `;

    document.getElementById('numDays').addEventListener('change', (e) => {
        state.numDays = parseInt(e.target.value) || 5;
    });
    document.getElementById('numSlots').addEventListener('change', (e) => {
        state.numSlots = parseInt(e.target.value) || 6;
    });
}

function toggleYear(yearNum) {
    const idx = state.selectedYears.indexOf(yearNum);
    if (idx >= 0) {
        if (state.selectedYears.length <= 1) return; // at least 1 year
        state.selectedYears.splice(idx, 1);
        delete state.yearConfigs[yearNum];
        if (state.activeYear === yearNum) state.activeYear = state.selectedYears[0];
    } else {
        state.selectedYears.push(yearNum);
        state.selectedYears.sort();
        state.yearConfigs[yearNum] = defaultYearConfig();
    }
    renderStep0(document.getElementById('wizardCard'));
}

// ─── Step 1: Basic Setup ─────────────────────────────────────
function renderStep1(card) {
    const c = yc();
    card.innerHTML = `
        ${renderYearTabs()}
        <div class="step-header">
            <span class="step-badge">⚙️ Step 2 of ${STEPS.length}</span>
            <h2>Basic Setup — ${YEAR_LABELS[state.activeYear-1]}</h2>
            <p>Configure departments & sections for ${YEAR_LABELS[state.activeYear-1].toLowerCase()}.</p>
        </div>

        <div class="form-group" style="margin-top: 12px; margin-bottom: 24px;">
            <label style="color: var(--text-primary); font-size: 1.05rem; display: block; margin-bottom: 10px;">Schedule Mode <span class="required">*</span></label>
            <div style="display: flex; gap: 20px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-primary);">
                    <input type="radio" name="scheduleMode" value="class" ${c.scheduleMode === 'class' ? 'checked' : ''} style="accent-color: var(--accent-primary); width: 18px; height: 18px;">
                    Class-wise (Default)
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-primary);">
                    <input type="radio" name="scheduleMode" value="cluster" ${c.scheduleMode === 'cluster' ? 'checked' : ''} style="accent-color: var(--accent-primary); width: 18px; height: 18px;">
                    Cluster-wise
                </label>
            </div>
        </div>

        ${c.scheduleMode === 'cluster' ? `
        <div class="form-grid" style="animation: fadeIn 0.3s ease-out;">
            <div class="form-group">
                <label>Sections per Cluster <span class="required">*</span></label>
                <input type="number" class="form-input" id="sectionsPerCluster" min="1" max="20"
                    value="${c.sectionsPerCluster}" placeholder="e.g. 5">
                <small style="color: var(--text-muted); margin-top: 4px;">Sections will be grouped in sizes of this number.</small>
            </div>
        </div>
        ` : ''}

        <div class="step-header" style="margin-top: 32px; margin-bottom: 16px;">
            <h2 style="font-size: 1.2rem;">Departments & Sections</h2>
            <p>Add each department and the number of sections it has.</p>
        </div>

        <div class="entries-container" id="deptEntries">
            ${c.departments.map((dept, i) => renderDeptEntry(dept, i)).join('')}
        </div>
        <button class="add-entry-btn" onclick="addDepartment()">
            <span>＋</span> Add Department
        </button>

        ${renderWizardActions(true, true)}
    `;

    bindStep1Events();
}

function renderDeptEntry(dept, index) {
    return `
        <div class="entry-card dept-entry" data-index="${index}">
            <span class="entry-number">DEPT ${index + 1}</span>
            ${yc().departments.length > 1 ? `<button class="remove-entry" onclick="removeDepartment(${index})">×</button>` : ''}
            <div class="entry-fields">
                <div class="form-group">
                    <label>Department Name</label>
                    <input type="text" class="form-input dept-name" data-index="${index}"
                        value="${dept.name}" placeholder="e.g. Computer Science">
                </div>
                <div class="form-group">
                    <label>Sections</label>
                    <input type="number" class="form-input dept-sections" data-index="${index}"
                        min="1" max="10" value="${dept.sections}" placeholder="e.g. 2">
                </div>
            </div>
        </div>
    `;
}

function bindStep1Events() {
    document.querySelectorAll('input[name="scheduleMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            yc().scheduleMode = e.target.value;
            renderStep1(document.getElementById('wizardCard'));
        });
    });
    const spcInput = document.getElementById('sectionsPerCluster');
    if (spcInput) {
        spcInput.addEventListener('change', (e) => {
            yc().sectionsPerCluster = parseInt(e.target.value) || 2;
        });
    }
    document.querySelectorAll('.dept-name').forEach(el => {
        el.addEventListener('input', (e) => {
            yc().departments[e.target.dataset.index].name = e.target.value;
        });
    });
    document.querySelectorAll('.dept-sections').forEach(el => {
        el.addEventListener('change', (e) => {
            yc().departments[e.target.dataset.index].sections = parseInt(e.target.value) || 1;
            resetLabBoard();
        });
    });
}

function addDepartment() {
    yc().departments.push({ name: '', sections: 1 });
    resetLabBoard();
    renderStep1(document.getElementById('wizardCard'));
}

function removeDepartment(index) {
    yc().departments.splice(index, 1);
    resetLabBoard();
    renderStep1(document.getElementById('wizardCard'));
}

function renderStep2(card) {
    card.innerHTML = `
        ${renderYearTabs()}
        <div class="step-header">
            <span class="step-badge">📚 Step 3 of ${STEPS.length}</span>
            <h2>Subjects</h2>
            <p>Add THEORY/LAB subjects. LAB requires consecutive lab duration.</p>
        </div>

        <div class="entries-container" id="subjectEntries">
            ${yc().subjects.map((subj, i) => renderSubjectEntry(subj, i)).join('')}
        </div>
        <button class="add-entry-btn" onclick="addSubject()">
            <span>＋</span> Add Subject
        </button>

        ${renderWizardActions(true, true)}
    `;

    bindStep2Events();
}

function renderSubjectEntry(subj, index) {
    return `
        <div class="entry-card" data-index="${index}">
            <span class="entry-number">SUBJECT ${index + 1}</span>
            ${yc().subjects.length > 1 ? `<button class="remove-entry" onclick="removeSubject(${index})">×</button>` : ''}
            <div class="entry-fields">
                <div class="form-group">
                    <label>Subject Name</label>
                    <input type="text" class="form-input subj-name" data-index="${index}"
                        value="${subj.name}" placeholder="e.g. Data Structures">
                </div>
                <div class="form-group">
                    <label>Hours per Week</label>
                    <input type="number" class="form-input subj-hours" data-index="${index}"
                        min="1" max="20" value="${subj.hours}" placeholder="e.g. 3">
                </div>
                <div class="form-group">
                    <label>Type</label>
                    <select class="form-select subj-type" data-index="${index}">
                        <option value="THEORY" ${subj.type === 'THEORY' ? 'selected' : ''}>THEORY</option>
                        <option value="LAB" ${subj.type === 'LAB' ? 'selected' : ''}>LAB</option>
                    </select>
                </div>
                ${subj.type === 'LAB' ? `
                <div class="form-group">
                    <label>Lab Duration (Consecutive Slots)</label>
                    <input type="number" class="form-input subj-lab-duration" data-index="${index}"
                        min="2" max="${state.numSlots}" value="${subj.lab_duration || 2}">
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

function bindStep2Events() {
    document.querySelectorAll('.subj-name').forEach(el => {
        el.addEventListener('input', (e) => {
            yc().subjects[e.target.dataset.index].name = e.target.value;
            resetLabBoard();
        });
    });
    document.querySelectorAll('.subj-hours').forEach(el => {
        el.addEventListener('change', (e) => {
            yc().subjects[e.target.dataset.index].hours = parseInt(e.target.value) || 1;
            resetLabBoard();
        });
    });
    document.querySelectorAll('.subj-type').forEach(el => {
        el.addEventListener('change', (e) => {
            const i = parseInt(e.target.dataset.index);
            yc().subjects[i].type = e.target.value;
            resetLabBoard();
            renderStep();
        });
    });
    document.querySelectorAll('.subj-lab-duration').forEach(el => {
        el.addEventListener('change', (e) => {
            yc().subjects[e.target.dataset.index].lab_duration = parseInt(e.target.value) || 2;
            resetLabBoard();
        });
    });
}

function addSubject() {
    yc().subjects.push({ name: '', type: 'THEORY', hours: 3, lab_duration: 2 });
    resetLabBoard();
    renderStep2(document.getElementById('wizardCard'));
}

function removeSubject(index) {
    yc().subjects.splice(index, 1);
    resetLabBoard();
    renderStep2(document.getElementById('wizardCard'));
}

function renderStep3(card) {
    card.innerHTML = `
        ${renderYearTabs()}
        <div class="step-header">
            <span class="step-badge">🧪 Step 4 of ${STEPS.length}</span>
            <h2>Lab Rooms Input</h2>
            <p>Add all lab masters with ID, name and room number.</p>
        </div>

        <div class="entries-container">
            ${yc().labs.map((lab, i) => `
                <div class="entry-card">
                    <span class="entry-number">LAB ${i + 1}</span>
                    ${yc().labs.length > 1 ? `<button class="remove-entry" onclick="removeLab(${i})">×</button>` : ''}
                    <div class="entry-fields">
                        <div class="form-group"><label>Lab ID</label><input class="form-input lab-id" data-index="${i}" value="${lab.lab_id || ''}"></div>
                        <div class="form-group"><label>Lab Name</label><input class="form-input lab-name" data-index="${i}" value="${lab.lab_name || ''}" placeholder="e.g. DSA Lab"></div>
                        <div class="form-group"><label>Room Number</label><input class="form-input lab-room" data-index="${i}" value="${lab.room_number || ''}" placeholder="e.g. LAB 511A"></div>
                    </div>
                </div>
            `).join('')}
        </div>
        <button class="add-entry-btn" onclick="addLab()">
            <span>＋</span> Add Lab
        </button>

        ${renderWizardActions(true, true)}
    `;
    document.querySelectorAll('.lab-id').forEach(el => {
        el.addEventListener('input', (e) => {
            yc().labs[e.target.dataset.index].lab_id = e.target.value;
        });
    });
    document.querySelectorAll('.lab-name').forEach(el => {
        el.addEventListener('input', (e) => {
            yc().labs[e.target.dataset.index].lab_name = e.target.value;
        });
    });
    document.querySelectorAll('.lab-room').forEach(el => {
        el.addEventListener('input', (e) => {
            yc().labs[e.target.dataset.index].room_number = e.target.value;
            resetLabBoard();
        });
    });
}

function addLab() {
    yc().labs.push({ lab_id: `LAB-${yc().labs.length + 1}`, lab_name: '', room_number: '' });
    resetLabBoard();
    renderStep3(document.getElementById('wizardCard'));
}

function removeLab(index) {
    yc().labs.splice(index, 1);
    resetLabBoard();
    renderStep3(document.getElementById('wizardCard'));
}

function renderStep4(card) {
    const sections = getSections();
    ensureLabBlocksInitialized();
    const currentSection = yc().activeLabSection && sections.includes(yc().activeLabSection) ? yc().activeLabSection : (sections[0] || '');
    yc().activeLabSection = currentSection;
    const unassigned = yc().labBlocks.filter(b => b.section === currentSection && !yc().labAssignments.some(a => a.blockId === b.id));
    const assignedCurrent = yc().labAssignments.filter(a => a.section === currentSection);
    const availableLabRooms = yc().labs
        .filter(l => (l.room_number || '').trim())
        .map(l => ({
            room_number: String(l.room_number).trim(),
            lab_name: String(l.lab_name || l.lab_id || '').trim(),
        }));

    card.innerHTML = `
        ${renderYearTabs()}
        <div class="step-header">
            <span class="step-badge">🧩 Step 5 of ${STEPS.length}</span>
            <h2>Lab Assignment Grid — ${YEAR_LABELS[state.activeYear-1]}</h2>
            <p>Assign each lab block to a specific day, starting slot, and room. Labs occupy consecutive slots.</p>
        </div>
        <div class="form-group" style="max-width: 320px;">
            <label>Section</label>
            <select id="activeLabSection" class="form-select">
                ${sections.map(s => `<option value="${escapeHtml(s)}" ${s === currentSection ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
            </select>
        </div>

        <div class="lab-assign-layout">
            <!-- Unassigned Lab Blocks -->
            <div class="entry-card">
                <h4 style="margin-bottom: 12px;">📦 Unassigned Lab Blocks</h4>
                ${unassigned.length === 0 ? '<div style="color: var(--text-muted); padding: 12px;">All lab blocks assigned! ✅</div>' : ''}
                <div class="lab-assign-list">
                    ${unassigned.map(block => `
                        <div class="lab-assign-block" data-block-id="${escapeHtml(block.id)}">
                            <div class="lab-assign-block-header">
                                <strong>🧪 ${escapeHtml(block.subject)}</strong>
                                <span class="lab-duration-badge">${block.duration} slots</span>
                            </div>
                            <div class="lab-assign-controls">
                                <select class="form-select lab-assign-day" data-block-id="${escapeHtml(block.id)}">
                                    ${Array.from({length: state.numDays}, (_, d) => `<option value="${d}">${DAY_NAMES[d]}</option>`).join('')}
                                </select>
                                <select class="form-select lab-assign-slot" data-block-id="${escapeHtml(block.id)}">
                                    ${Array.from({length: state.numSlots}, (_, s) => `<option value="${s}">Slot ${s + 1}</option>`).join('')}
                                </select>
                                <select class="form-select lab-assign-room" data-block-id="${escapeHtml(block.id)}">
                                    ${availableLabRooms.map(r => `
                                        <option value="${escapeHtml(r.room_number)}" ${String(block.room) === String(r.room_number) ? 'selected' : ''}>
                                            ${escapeHtml(r.room_number)}${r.lab_name ? ' • ' + escapeHtml(r.lab_name) : ''}
                                        </option>
                                    `).join('')}
                                </select>
                                <button class="btn btn-primary btn-small lab-place-btn" data-block-id="${escapeHtml(block.id)}">Place ✓</button>
                            </div>
                            <div class="lab-assign-feedback" data-block-id="${escapeHtml(block.id)}" style="font-size:0.8rem;margin-top:4px;min-height:18px;"></div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Visual Grid + Assigned -->
            <div class="entry-card">
                <h4 style="margin-bottom: 12px;">📅 Schedule Grid</h4>
                ${renderLabDropGrid(currentSection)}

                <h4 style="margin: 16px 0 8px;">✅ Assigned Labs</h4>
                <div class="lab-assign-list">
                    ${assignedCurrent.length === 0 ? '<div style="color: var(--text-muted); padding: 8px;">No labs assigned yet for this section.</div>' : ''}
                    ${assignedCurrent.map(a => `
                        <div class="lab-block assigned">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <div>
                                    <strong>${escapeHtml(a.subject)}</strong>
                                    <span style="margin-left:8px;font-size:0.85rem;color:var(--text-secondary);">
                                        ${escapeHtml(DAY_NAMES[a.day])} • Slot ${a.slot + 1}–${a.slot + a.duration} • ${escapeHtml(a.room)}
                                    </span>
                                </div>
                                <button class="btn btn-secondary btn-small lab-remove-btn" data-remove-block-id="${escapeHtml(a.blockId)}" style="padding:4px 10px;font-size:0.8rem;">Remove ×</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>

        ${renderWizardActions(true, true)}
    `;
    bindStep4Events();
}

function renderStep5(card) {
    const theorySubjects = yc().subjects.filter(s => s.type === 'THEORY' && s.name.trim());
    const labSubjects = yc().subjects.filter(s => s.type === 'LAB' && s.name.trim());
    const allSubjects = [...theorySubjects, ...labSubjects];

    const numClusters = getNumClusters();
    const sections = getSections();

    const activeClusterRaw = yc().activeProfessorCluster ? parseInt(yc().activeProfessorCluster) : 1;
    const activeCluster = Math.min(Math.max(1, activeClusterRaw), numClusters);
    yc().activeProfessorCluster = activeCluster;

    const sectionsInCluster = sections.filter(sec => getClusterForSection(sec) === activeCluster);
    const activeSection = yc().activeProfessorSection && sectionsInCluster.includes(yc().activeProfessorSection)
        ? yc().activeProfessorSection
        : (sectionsInCluster[0] || '');
    yc().activeProfessorSection = activeSection;

    const teachersInCluster = yc().teachers.filter(t => String(t.cluster || 1) === String(activeCluster) && t.id.trim() && t.name.trim());

    card.innerHTML = `
        ${renderYearTabs()}
        <div class="step-header">
            <span class="step-badge">👩‍🏫 Step 6 of ${STEPS.length}</span>
            <h2>Professor Mapping — ${YEAR_LABELS[state.activeYear-1]}</h2>
            <p>Enter professors with unique IDs. Then map each subject to a professor for the selected section.</p>
        </div>

        <div class="entries-container">
            ${yc().teachers.map((t, i) => `
                <div class="entry-card">
                    <span class="entry-number">PROF ${i + 1}</span>
                    ${yc().teachers.length > 1 ? `<button class="remove-entry" onclick="removeProf(${i})">×</button>` : ''}
                    <div class="entry-fields">
                        <div class="form-group"><label>Professor ID</label><input class="form-input prof-id" data-index="${i}" value="${escapeHtml(t.id || '')}" placeholder="e.g. P-101"></div>
                        <div class="form-group"><label>Name</label><input class="form-input prof-name" data-index="${i}" value="${escapeHtml(t.name || '')}"></div>
                        <div class="form-group">
                            <label>Cluster</label>
                            <select class="form-select prof-cluster" data-index="${i}">
                                ${Array.from({ length: numClusters }, (_, ci) => ci + 1)
                                    .map(c => `<option value="${c}" ${String(t.cluster || 1) === String(c) ? 'selected' : ''}>Cluster ${c}</option>`)
                                    .join('')}
                            </select>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
        <button class="add-entry-btn" onclick="addProf()"><span>＋</span>Add Professor</button>

        <div class="form-grid" style="margin-top:18px;">
            <div class="form-group">
                <label>Choose Cluster</label>
                <select id="activeProfCluster" class="form-select">
                    ${Array.from({ length: numClusters }, (_, ci) => ci + 1).map(c => `
                        <option value="${c}" ${c === activeCluster ? 'selected' : ''}>Cluster ${c}</option>
                    `).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Choose Section in Cluster</label>
                <select id="activeProfSection" class="form-select">
                    ${sectionsInCluster.map(sec => `
                        <option value="${escapeHtml(sec)}" ${sec === activeSection ? 'selected' : ''}>${escapeHtml(sec)}</option>
                    `).join('')}
                </select>
            </div>
        </div>

        <div class="entries-container" style="margin-top:16px;">
            ${allSubjects.map(s => {
                const mapKey = `${activeSection}::${s.name}`;
                return `
                    <div class="entry-card">
                        <div class="entry-fields" style="grid-template-columns: 1fr;">
                            <div class="form-group">
                                <label>${escapeHtml(s.name)}</label>
                                <select class="form-select subj-prof" data-subject="${escapeHtml(s.name)}">
                                    <option value="">Select Professor</option>
                                    ${teachersInCluster.map(t => `
                                        <option value="${escapeHtml(t.id)}" ${yc().sectionSubjectTeacherMap[mapKey] === t.id ? 'selected' : ''}>
                                            ${escapeHtml(t.name)} (ID: ${escapeHtml(t.id)})
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>

        ${renderWizardActions(true, true)}
    `;

    document.querySelectorAll('.prof-id').forEach(el => {
        el.addEventListener('input', (e) => yc().teachers[e.target.dataset.index].id = e.target.value);
    });
    document.querySelectorAll('.prof-name').forEach(el => {
        el.addEventListener('input', (e) => yc().teachers[e.target.dataset.index].name = e.target.value);
    });
    document.querySelectorAll('.prof-cluster').forEach(el => {
        el.addEventListener('change', (e) => yc().teachers[e.target.dataset.index].cluster = parseInt(e.target.value) || 1);
    });

    const clusterSel = document.getElementById('activeProfCluster');
    if (clusterSel) {
        clusterSel.addEventListener('change', (e) => {
            yc().activeProfessorCluster = parseInt(e.target.value) || 1;
            yc().activeProfessorSection = '';
            renderStep();
        });
    }
    const sectionSel = document.getElementById('activeProfSection');
    if (sectionSel) {
        sectionSel.addEventListener('change', (e) => {
            yc().activeProfessorSection = e.target.value;
            renderStep();
        });
    }

    document.querySelectorAll('.subj-prof').forEach(el => {
        el.addEventListener('change', (e) => {
            const subj = e.target.dataset.subject;
            const mapKey = `${yc().activeProfessorSection}::${subj}`;
            yc().sectionSubjectTeacherMap[mapKey] = e.target.value;
        });
        // Snapshot current selection so the value is persisted even without
        // an explicit user change (e.g. first option auto-selected).
        if (el.value) {
            const subj = el.dataset.subject;
            const mapKey = `${yc().activeProfessorSection}::${subj}`;
            if (!yc().sectionSubjectTeacherMap[mapKey]) {
                yc().sectionSubjectTeacherMap[mapKey] = el.value;
            }
        }
    });
}

function renderStep6(card) {
    const sections = getSections();
    card.innerHTML = `
        ${renderYearTabs()}
        <div class="step-header">
            <span class="step-badge">🏫 Step 7 of ${STEPS.length}</span>
            <h2>Classroom Assignment — ${YEAR_LABELS[state.activeYear-1]}</h2>
            <p>Assign fixed classroom per section. Theory classes will use this room.</p>
        </div>
        <div class="entries-container">
            ${sections.map(sec => `
                <div class="entry-card">
                    <div class="entry-fields">
                        <div class="form-group"><label>${escapeHtml(sec)}</label><input class="form-input section-room" data-section="${escapeHtml(sec)}" value="${escapeHtml(yc().classrooms[sec] || '')}" placeholder="e.g. CR-201"></div>
                    </div>
                </div>
            `).join('')}
        </div>
        ${renderWizardActions(true, true)}
    `;
    document.querySelectorAll('.section-room').forEach(el => el.addEventListener('input', (e) => yc().classrooms[e.target.dataset.section] = e.target.value));
}

function renderStep7(card) {
    let yearSummaryHtml = '';
    for (const y of state.selectedYears) {
        const c = state.yearConfigs[y];
        const secCount = c.departments.reduce((sum, d) => sum + (parseInt(d.sections) || 1), 0);
        yearSummaryHtml += `
            <div class="summary-item" style="border-left:3px solid var(--accent-primary);padding-left:12px;">
                <div class="summary-label">🎓 ${YEAR_LABELS[y-1]}</div>
                <div style="font-size:.85rem;color:var(--text-secondary);margin-top:4px;">
                    ${secCount} section(s) · ${c.subjects.filter(s=>s.name.trim()).length} subjects · ${c.teachers.filter(t=>t.id.trim()).length} professors
                </div>
            </div>
        `;
    }
    card.innerHTML = `
        <div class="generate-step-content">
            <span class="generate-icon">🚀</span>
            <h3>Generate Multi-Year Timetable</h3>
            <p>Timetables for all selected years will be generated together. Shared professors across years won't get conflicting slots.</p>
            <div class="summary-grid" style="text-align:left;">
                ${yearSummaryHtml}
                <div class="summary-item"><div class="summary-label">Working Days</div><div class="summary-value">${state.numDays}</div></div>
                <div class="summary-item"><div class="summary-label">Slots/Day</div><div class="summary-value">${state.numSlots}</div></div>
            </div>
            <button class="btn btn-primary btn-generate" onclick="generateTimetable()">Generate Timetable</button>
            ${state.lastGenerationError ? `
            <div style="margin-top:16px; padding:12px; border:1px solid var(--danger); border-radius:10px; background:var(--danger-bg);">
                <div style="font-weight:700; color:var(--danger);">Generation Issue</div>
                <div style="font-size:.85rem; color:var(--text-secondary); margin-top:4px;">${escapeHtml(state.lastGenerationError)}</div>
                <button class="btn btn-secondary btn-small" style="margin-top:10px;" onclick="retryGenerateTimetable()">Retry</button>
            </div>
            ` : ''}
        </div>
        ${renderWizardActions(true, false)}
    `;
}

// ─── Wizard Navigation Actions ───────────────────────────────
function renderWizardActions(showBack, showNext) {
    return `
        <div class="wizard-actions">
            ${showBack
                ? `<button class="btn btn-secondary" onclick="goBack()">← Back</button>`
                : '<div></div>'}
            ${showNext
                ? `<button class="btn btn-primary" onclick="goNext()">Next →</button>`
                : '<div></div>'}
        </div>
    `;
}

function goNext() {
    // Step 0: Year selection — just need at least 1 year
    if (state.currentStep === 0) {
        if (state.selectedYears.length === 0) {
            showToast('Select at least one year.', 'error');
            return;
        }
        state.activeYear = state.selectedYears[0];
    }
    // Step 1: Basic Setup — validate for active year
    if (state.currentStep === 1) {
        if (yc().departments.some(d => !d.name.trim())) {
            showToast(`[${YEAR_LABELS[state.activeYear-1]}] Please fill in all department names.`, 'error');
            return;
        }
    }
    if (state.currentStep === 2) {
        if (yc().subjects.some(s => !s.name.trim())) {
            showToast(`[${YEAR_LABELS[state.activeYear-1]}] Please fill in all subject names.`, 'error');
            return;
        }
    }
    if (state.currentStep === 3) {
        if (yc().labs.some(l => !l.lab_id.trim() || !l.lab_name.trim() || !l.room_number.trim())) {
            showToast(`[${YEAR_LABELS[state.activeYear-1]}] Please fill all lab rows (id/name/room).`, 'error');
            return;
        }
    }
    if (state.currentStep === 5) {
        if (yc().teachers.some(t => !t.id.trim() || !t.name.trim())) {
            showToast(`[${YEAR_LABELS[state.activeYear-1]}] Please fill all professor IDs and names.`, 'error');
            return;
        }
        const subjectsToMap = yc().subjects.filter(s => (s.type === 'THEORY' || s.type === 'LAB') && s.name.trim());
        const sections = getSections();

        for (const s of subjectsToMap) {
            const sName = s.name.trim();
            for (const sec of sections) {
                const key = `${sec}::${sName}`;
                if (yc().sectionSubjectTeacherMap[key]) continue;
                const cluster = getClusterForSection(sec);
                const sibling = sections.find(other =>
                    other !== sec &&
                    getClusterForSection(other) === cluster &&
                    yc().sectionSubjectTeacherMap[`${other}::${sName}`]
                );
                if (sibling) {
                    yc().sectionSubjectTeacherMap[key] = yc().sectionSubjectTeacherMap[`${sibling}::${sName}`];
                }
            }
        }

        for (const sec of sections) {
            for (const s of subjectsToMap) {
                const key = `${sec}::${s.name.trim()}`;
                if (!yc().sectionSubjectTeacherMap[key]) {
                    showToast(`[${YEAR_LABELS[state.activeYear-1]}] Map ${s.name} for ${sec}.`, 'error');
                    return;
                }
            }
        }
    }
    if (state.currentStep === 6) {
        if (getSections().some(sec => !(yc().classrooms[sec] || '').trim())) {
            showToast(`[${YEAR_LABELS[state.activeYear-1]}] Assign classroom for every section.`, 'error');
            return;
        }
    }

    if (state.currentStep < STEPS.length - 1) {
        state.currentStep++;
        renderStepper();
        renderStep();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function goBack() {
    if (state.currentStep > 0) {
        state.currentStep--;
        renderStepper();
        renderStep();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

async function generateTimetable() {
    // Build per-year payloads
    const yearsPayload = {};
    for (const y of state.selectedYears) {
        const c = state.yearConfigs[y];
        const teachers = c.teachers
            .filter(t => t.id.trim() && t.name.trim())
            .map(t => ({
                id: t.id.trim(),
                name: t.name.trim(),
                cluster: t.cluster || 1,
                max_consecutive_classes: t.max_consecutive_classes || c.constraints.maxConsecutiveClasses,
                availability: parseAvailabilityText(t.availabilityText || '')
            }));
        yearsPayload[String(y)] = {
            yearLabel: YEAR_LABELS[y - 1],
            scheduleMode: c.scheduleMode,
            sectionsPerCluster: c.sectionsPerCluster,
            departments: c.departments.filter(d => d.name.trim()),
            numDays: state.numDays,
            numSlots: state.numSlots,
            subjects: c.subjects.filter(s => s.name.trim()),
            labs: c.labs.filter(l => l.lab_name.trim()),
            labAssignments: c.labAssignments,
            teachers,
            sectionSubjectTeacherMap: c.sectionSubjectTeacherMap,
            classrooms: c.classrooms,
            constraints: c.constraints,
            retrySeed: state.retrySeed,
        };
    }

    const payload = {
        years: yearsPayload,
        numDays: state.numDays,
        numSlots: state.numSlots,
    };

    document.getElementById('loadingOverlay').classList.add('active');

    try {
        const response = await fetch('/api/generate-multi-year', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (!response.ok || result.error) {
            throw new Error(result.error || 'Failed to generate timetable');
        }

        state.results = result;
        state.lastGenerationError = '';
        showResults(result);
        showToast('Timetable generated successfully!', 'success');
        if (result.warnings && result.warnings.length) {
            showToast(`Generated with ${result.warnings.length} warning(s).`, 'info');
        }
    } catch (error) {
        state.lastGenerationError = error.message || 'Generation failed';
        if (state.currentStep === 7) renderStep();
        showToast('Generation failed: ' + (error.message || ''), 'error');
    } finally {
        document.getElementById('loadingOverlay').classList.remove('active');
    }
}

function retryGenerateTimetable() {
    state.retrySeed = Date.now();
    generateTimetable();
}

function showResults(result) {
    document.getElementById('wizardCard').classList.add('hidden');
    document.getElementById('stepperContainer').classList.add('hidden');

    const resultsSection = document.getElementById('resultsSection');
    resultsSection.classList.add('active');

    const config = result.config;
    const yearResults = result.yearResults || {};
    const combinedTeacherTT = result.combinedTeacherTimetables || {};

    // Build section timetables grouped by year
    let sectionHtml = '';
    const yearKeys = Object.keys(yearResults).sort((a, b) => parseInt(a) - parseInt(b));
    for (const yk of yearKeys) {
        const yr = yearResults[yk];
        if (yr.error) {
            sectionHtml += `<div class="timetable-section"><div class="timetable-title"><span class="section-badge" style="background:var(--danger);">⚠️</span><h3>${yr.yearLabel} — Error</h3></div><p style="color:var(--danger);padding:12px;">${escapeHtml(yr.error)}</p></div>`;
            continue;
        }
        const sectionTTs = yr.data.sectionTimetables || {};
        sectionHtml += `<div style="margin-bottom:12px;"><h2 style="font-size:1.4rem;font-weight:800;color:var(--accent-tertiary);margin-bottom:16px;">🎓 ${escapeHtml(yr.yearLabel)}</h2></div>`;
        for (const [sectionId, grid] of Object.entries(sectionTTs)) {
            sectionHtml += `
                <div class="timetable-section">
                    <div class="timetable-title">
                        <span class="section-badge">📋</span>
                        <h3>${escapeHtml(sectionId)}</h3>
                    </div>
                    ${renderTimetableTable(grid, config)}
                </div>
            `;
        }
    }

    resultsSection.innerHTML = `
        <div class="results-header">
            <h2>📊 Generated Timetable</h2>
            <div class="results-actions">
                <div class="view-toggle">
                    <button id="viewSections" class="active" onclick="switchView('sections')">📋 Section-wise</button>
                    <button id="viewTeachers" onclick="switchView('teachers')">👩‍🏫 Teacher-wise</button>
                </div>
                <button class="btn btn-outline btn-small" onclick="exportPDF()">📄 Export PDF</button>
                <button class="btn btn-outline btn-small" onclick="exportExcel()">📊 Export Excel</button>
                <button class="btn btn-secondary btn-small" onclick="goBackToWizard()">← Edit Inputs</button>
            </div>
        </div>

        <div id="sectionTimetablesView">
            ${sectionHtml}
        </div>

        <div id="teacherTimetablesView" class="hidden">
            ${renderTeacherTimetables(combinedTeacherTT, config)}
        </div>
    `;
}

function renderSectionTimetables(timetables, config) {
    let html = '';
    for (const [sectionId, grid] of Object.entries(timetables)) {
        html += `
            <div class="timetable-section">
                <div class="timetable-title">
                    <span class="section-badge">📋</span>
                    <h3>${sectionId}</h3>
                </div>
                ${renderTimetableTable(grid, config)}
            </div>
        `;
    }
    return html;
}

function renderTeacherTimetables(timetables, config) {
    let html = '';
    if (!timetables || Object.keys(timetables).length === 0) {
        return '<p style="color: var(--text-muted); text-align: center; padding: 40px;">No teacher timetables available.</p>';
    }
    for (const [teacherName, grid] of Object.entries(timetables)) {
        html += `
            <div class="timetable-section">
                <div class="timetable-title">
                    <span class="section-badge">👩‍🏫</span>
                    <h3>${teacherName}</h3>
                </div>
                ${renderTimetableTable(grid, config, true)}
            </div>
        `;
    }
    return html;
}

function renderTimetableTable(grid, config, isTeacher = false) {
    const numDays = config.numDays;
    const numSlots = config.numSlots;

    let headerHtml = '<tr><th>Day \\ Slot</th>';
    for (let s = 0; s < numSlots; s++) {
        headerHtml += `<th>Slot ${s + 1}</th>`;
    }
    headerHtml += '</tr>';

    let bodyHtml = '';
    for (let d = 0; d < numDays; d++) {
        const dayName = DAY_NAMES[d] || `Day ${d + 1}`;
        bodyHtml += `<tr><td>${dayName}</td>`;
        for (let s = 0; s < numSlots; s++) {
            const cell = grid[d] && grid[d][s];
            if (!cell || cell.isFree) {
                bodyHtml += `<td><span class="cell-free">Free</span></td>`;
            } else if (cell.isLunch) {
                bodyHtml += `<td class="cell-lunch">🍽️ LUNCH</td>`;
            } else {
                const labClass = cell.isLab ? 'cell-lab' : '';
                if (isTeacher) {
                    bodyHtml += `
                        <td class="${labClass}">
                            <div class="cell-subject">${cell.subject}</div>
                            <div class="cell-teacher">${cell.section || ''}</div>
                            <div class="cell-room">${cell.room || ''}</div>
                        </td>
                    `;
                } else {
                    bodyHtml += `
                        <td class="${labClass}">
                            <div class="cell-subject">${cell.subject}</div>
                            <div class="cell-teacher">${cell.teacher || ''}</div>
                            <div class="cell-room">${cell.room || ''}</div>
                        </td>
                    `;
                }
            }
        }
        bodyHtml += '</tr>';
    }

    return `
        <div class="timetable-wrapper">
            <table class="timetable">
                <thead>${headerHtml}</thead>
                <tbody>${bodyHtml}</tbody>
            </table>
        </div>
    `;
}

function switchView(view) {
    const sectionsView = document.getElementById('sectionTimetablesView');
    const teachersView = document.getElementById('teacherTimetablesView');
    const btnSections = document.getElementById('viewSections');
    const btnTeachers = document.getElementById('viewTeachers');

    if (view === 'sections') {
        sectionsView.classList.remove('hidden');
        teachersView.classList.add('hidden');
        btnSections.classList.add('active');
        btnTeachers.classList.remove('active');
    } else {
        sectionsView.classList.add('hidden');
        teachersView.classList.remove('hidden');
        btnSections.classList.remove('active');
        btnTeachers.classList.add('active');
    }
}

function goBackToWizard() {
    document.getElementById('wizardCard').classList.remove('hidden');
    document.getElementById('stepperContainer').classList.remove('hidden');
    document.getElementById('resultsSection').classList.remove('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── Export PDF ──────────────────────────────────────────────
function exportPDF() {
    showToast('Preparing PDF export...', 'info');
    setTimeout(() => {
        window.print();
    }, 500);
}

function exportExcel() {
    if (!state.results || !state.results.yearResults) {
        showToast('Generate timetable first.', 'error');
        return;
    }
    const rows = ['Year,Section,Day,Slot,Subject,Teacher,Room'];
    const yearResults = state.results.yearResults;
    for (const [yk, yr] of Object.entries(yearResults)) {
        if (yr.error || !yr.data) continue;
        const timetables = yr.data.sectionTimetables || {};
        Object.entries(timetables).forEach(([section, grid]) => {
            grid.forEach((dayRow, dayIdx) => {
                dayRow.forEach((cell, slotIdx) => {
                    if (cell.isFree) return;
                    rows.push([
                        `"${yr.yearLabel}"`,
                        `"${section}"`,
                        `"${DAY_NAMES[dayIdx] || `Day ${dayIdx + 1}`}"`,
                        slotIdx + 1,
                        `"${(cell.subject || '').replaceAll('"', '""')}"`,
                        `"${(cell.teacher || '').replaceAll('"', '""')}"`,
                        `"${(cell.room || '').replaceAll('"', '""')}"`
                    ].join(','));
                });
            });
        });
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'timetable_export.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Excel-compatible CSV exported.', 'success');
}

// ─── Save / Load Config ──────────────────────────────────────
function openSaveModal() {
    document.getElementById('saveModal').classList.add('active');
    document.getElementById('configNameInput').focus();
}

function closeSaveModal() {
    document.getElementById('saveModal').classList.remove('active');
}

async function saveConfiguration() {
    const name = document.getElementById('configNameInput').value.trim();
    if (!name) {
        showToast('Please enter a configuration name.', 'error');
        return;
    }

    const payload = {
        name: name,
        scheduleMode: yc().scheduleMode,
        sectionsPerCluster: yc().sectionsPerCluster,
        departments: yc().departments,
        numDays: state.numDays,
        numSlots: state.numSlots,
        subjects: yc().subjects,
        teachers: yc().teachers,
        constraints: yc().constraints,
    };

    try {
        const response = await fetch('/api/save-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        if (result.success) {
            showToast('Configuration saved successfully!', 'success');
            closeSaveModal();
        } else {
            throw new Error(result.error || 'Failed to save');
        }
    } catch (error) {
        showToast('Error saving: ' + error.message, 'error');
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function getSections() {
    const sections = [];
    yc().departments.forEach(d => {
        const total = parseInt(d.sections) || 1;
        for (let i = 0; i < total; i++) {
            sections.push(`${d.name} - Section ${String.fromCharCode(65 + i)}`);
        }
    });
    return sections;
}

function parseAvailabilityText(text) {
    if (!text.trim()) return [];
    return text.split(',').map(x => x.trim()).filter(Boolean).map(token => {
        const [d, s] = token.split('-');
        return { day: parseInt(d), slot: parseInt(s) };
    }).filter(x => Number.isInteger(x.day) && Number.isInteger(x.slot));
}

function addProf() {
    yc().teachers.push({ id: '', name: '', cluster: 1, max_consecutive_classes: 2, availabilityText: '' });
    renderStep();
}

function removeProf(index) {
    yc().teachers.splice(index, 1);
    renderStep();
}

function resetLabBoard() {
    yc().labBlocks = [];
    yc().labAssignments = [];
}

function validateLabAssignment(candidate, ignoreBlockId = null) {
    const duration = candidate.duration;
    const endSlot = candidate.slot + duration;
    if (endSlot > state.numSlots) return { ok: false, message: 'Lab must be consecutive slots within day.' };
    for (const existing of yc().labAssignments) {
        if (ignoreBlockId && existing.blockId === ignoreBlockId) continue;
        if (existing.day !== candidate.day) continue;
        const overlap = !(candidate.slot + duration <= existing.slot || existing.slot + existing.duration <= candidate.slot);
        if (!overlap) continue;
        if (existing.section === candidate.section) return { ok: false, message: 'No overlapping labs for same class.' };
        if (existing.room === candidate.room) return { ok: false, message: 'Room already occupied' };
        const t1 = getTeacherIdForSectionSubject(candidate.section, candidate.subject);
        const t2 = getTeacherIdForSectionSubject(existing.section, existing.subject);
        if (t1 && t2 && t1 === t2) return { ok: false, message: 'Professor conflict' };
    }
    return { ok: true };
}

function ensureLabBlocksInitialized() {
    if (!yc().activeLabSection) yc().activeLabSection = getSections()[0] || '';
    const sections = getSections();
    const labSubjects = yc().subjects.filter(s => s.type === 'LAB' && s.name.trim());

    // Build expected block IDs to detect if re-init is needed
    const expectedIds = new Set();
    labSubjects.forEach(subject => {
        const sessions = Math.max(1, Math.round((subject.hours || 1) / (subject.lab_duration || 2)));
        for (const section of sections) {
            for (let i = 0; i < sessions; i++) {
                expectedIds.add(`${section}__${subject.name}__${i}`);
            }
        }
    });

    // Check if existing blocks match expected — skip if already correct
    const existingIds = new Set(yc().labBlocks.map(b => b.id));
    const sameSize = expectedIds.size === existingIds.size;
    const sameContent = sameSize && [...expectedIds].every(id => existingIds.has(id));
    if (sameContent && expectedIds.size > 0) return;

    // Preserve existing assignments that are still valid
    const oldAssignments = yc().labAssignments.filter(a => expectedIds.has(a.blockId));

    yc().labBlocks = [];
    labSubjects.forEach(subject => {
        const sessions = Math.max(1, Math.round((subject.hours || 1) / (subject.lab_duration || 2)));
        for (const section of sections) {
            for (let i = 0; i < sessions; i++) {
                yc().labBlocks.push({
                    id: `${section}__${subject.name}__${i}`,
                    section,
                    subject: subject.name,
                    duration: subject.lab_duration || 2,
                    room: yc().labs[0]?.room_number || ''
                });
            }
        }
    });

    yc().labAssignments = oldAssignments;
}

function renderLabDropGrid(section) {
    const header = Array.from({ length: state.numSlots }, (_, i) => `<th>Slot ${i + 1}</th>`).join('');
    let body = '';
    for (let day = 0; day < state.numDays; day++) {
        body += `<tr><td>${DAY_NAMES[day]}</td>`;
        let slot = 0;
        while (slot < state.numSlots) {
            const existing = yc().labAssignments.find(a => a.section === section && a.day === day && a.slot === slot);
            if (existing) {
                // Use data attribute instead of inline onclick with escaped blockId
                body += `<td class="lab-grid-cell lab-occupied" colspan="${existing.duration}">
                    <div style="font-weight:600;">${escapeHtml(existing.subject)}</div>
                    <div style="font-size:.75rem;opacity:.8;">${escapeHtml(existing.room)}</div>
                    <button class="remove-lab-assign" data-remove-block-id="${escapeHtml(existing.blockId)}" title="Remove" style="position:absolute;top:2px;right:4px;background:none;border:none;color:var(--danger);cursor:pointer;font-size:1rem;line-height:1;">×</button>
                </td>`;
                slot += existing.duration;
                continue;
            }
            // Check if this slot is part of a multi-slot lab that started earlier
            const spanning = yc().labAssignments.find(a => a.section === section && a.day === day && slot > a.slot && slot < (a.slot + a.duration));
            if (spanning) {
                // Skip — already covered by colspan
                slot++;
                continue;
            }
            body += `<td class="lab-grid-cell lab-drop-cell" data-section="${escapeHtml(section)}" data-day="${day}" data-slot="${slot}"></td>`;
            slot++;
        }
        body += '</tr>';
    }
    return `<div class="timetable-wrapper"><table class="timetable lab-drop-table"><thead><tr><th>Day \\ Slot</th>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function removeLabAssignment(blockId) {
    // Unescape HTML entities that may have been encoded in data attributes
    const decoded = blockId.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
    const idx = yc().labAssignments.findIndex(a => a.blockId === decoded || a.blockId === blockId);
    if (idx >= 0) {
        yc().labAssignments.splice(idx, 1);
        renderStep();
    }
}

function decodeBlockId(raw) {
    return String(raw || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
}

function findBlockById(blockId) {
    const decoded = decodeBlockId(blockId);
    return yc().labBlocks.find(b => b.id === decoded || b.id === blockId);
}

function resolveLabRoom(block) {
    // Block's own room > first available lab
    if (block.room && String(block.room).trim()) return String(block.room).trim();
    const firstLab = yc().labs.find(l => (l.room_number || '').trim());
    return firstLab ? String(firstLab.room_number).trim() : '';
}

function placeLabBlock(blockId, section, day, slot, roomOverride) {
    const decoded = decodeBlockId(blockId);
    const block = findBlockById(decoded);
    if (!block) {
        showToast('Lab block not found.', 'error');
        return false;
    }

    const roomToUse = roomOverride || resolveLabRoom(block);
    if (!roomToUse) {
        showToast('No lab room available. Add lab rooms first.', 'error');
        return false;
    }

    const candidate = {
        blockId: decoded,
        subject: block.subject,
        section: section,
        room: roomToUse,
        day,
        slot,
        duration: block.duration
    };
    const validation = validateLabAssignment(candidate, decoded);
    if (!validation.ok) {
        showToast(validation.message, 'error');
        return false;
    }
    // Remove existing assignment for this block if re-placing
    const oldIdx = yc().labAssignments.findIndex(a => a.blockId === decoded);
    if (oldIdx >= 0) yc().labAssignments.splice(oldIdx, 1);
    yc().labAssignments.push(candidate);
    state.draggingLabBlockId = '';
    return true;
}

function bindStep4Events() {
    // Section selector
    const sectionSelect = document.getElementById('activeLabSection');
    if (sectionSelect) {
        sectionSelect.addEventListener('change', (e) => {
            yc().activeLabSection = e.target.value;
            renderStep();
        });
    }

    // Remove buttons
    document.querySelectorAll('.lab-remove-btn[data-remove-block-id]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeLabAssignment(btn.dataset.removeBlockId);
        });
    });

    // Place buttons — the main form-based assignment
    document.querySelectorAll('.lab-place-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const rawBlockId = btn.dataset.blockId;
            const blockId = decodeBlockId(rawBlockId);
            const block = findBlockById(blockId);
            if (!block) {
                showToast('Lab block not found.', 'error');
                return;
            }

            // Read values from this block's dropdowns
            const daySelect = document.querySelector(`.lab-assign-day[data-block-id="${rawBlockId}"]`);
            const slotSelect = document.querySelector(`.lab-assign-slot[data-block-id="${rawBlockId}"]`);
            const roomSelect = document.querySelector(`.lab-assign-room[data-block-id="${rawBlockId}"]`);
            const feedbackEl = document.querySelector(`.lab-assign-feedback[data-block-id="${rawBlockId}"]`);

            const day = parseInt(daySelect.value);
            const slot = parseInt(slotSelect.value);
            const room = roomSelect ? roomSelect.value : block.room;
            const section = yc().activeLabSection;

            if (!room) {
                showToast('Select a lab room first.', 'error');
                return;
            }

            // Validate
            const candidate = {
                blockId: blockId,
                subject: block.subject,
                section: section,
                room: room,
                day: day,
                slot: slot,
                duration: block.duration,
            };
            const validation = validateLabAssignment(candidate, blockId);
            if (!validation.ok) {
                if (feedbackEl) {
                    feedbackEl.textContent = '❌ ' + validation.message;
                    feedbackEl.style.color = 'var(--danger)';
                }
                showToast(validation.message, 'error');
                return;
            }

            // Remove old assignment if exists
            const oldIdx = yc().labAssignments.findIndex(a => a.blockId === blockId);
            if (oldIdx >= 0) yc().labAssignments.splice(oldIdx, 1);

            // Push new assignment
            yc().labAssignments.push(candidate);
            showToast(`${block.subject} placed on ${DAY_NAMES[day]} Slot ${slot+1}–${slot+block.duration}`, 'success');
            renderStep();
        });
    });

    // Live validation feedback when changing day/slot dropdowns
    document.querySelectorAll('.lab-assign-day, .lab-assign-slot, .lab-assign-room').forEach(sel => {
        sel.addEventListener('change', () => {
            const rawBlockId = sel.dataset.blockId;
            const blockId = decodeBlockId(rawBlockId);
            const block = findBlockById(blockId);
            if (!block) return;

            const daySelect = document.querySelector(`.lab-assign-day[data-block-id="${rawBlockId}"]`);
            const slotSelect = document.querySelector(`.lab-assign-slot[data-block-id="${rawBlockId}"]`);
            const roomSelect = document.querySelector(`.lab-assign-room[data-block-id="${rawBlockId}"]`);
            const feedbackEl = document.querySelector(`.lab-assign-feedback[data-block-id="${rawBlockId}"]`);

            const day = parseInt(daySelect.value);
            const slot = parseInt(slotSelect.value);
            const room = roomSelect ? roomSelect.value : block.room;
            const section = yc().activeLabSection;

            const candidate = {
                blockId, subject: block.subject, section, room, day, slot, duration: block.duration,
            };
            const validation = validateLabAssignment(candidate, blockId);
            if (feedbackEl) {
                if (validation.ok) {
                    feedbackEl.textContent = '✅ Valid placement';
                    feedbackEl.style.color = 'var(--success)';
                } else {
                    feedbackEl.textContent = '⚠️ ' + validation.message;
                    feedbackEl.style.color = 'var(--warning)';
                }
            }
        });
    });
}

function escapeHtml(value) {
    return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
