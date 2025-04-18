let MTTD_data = {};
let currentPage = 1;
const buildsPerPage = 20;
let totalBuilds = 0;
let totalPages = 0;
let ttdDataLast14Days = [];
let ttdDataLast30Days = [];

async function fetchMTTDData() {
    try {
        const response = await fetch('http://10.0.41.79:5000/all');
        if (!response.ok) {
            throw new Error('Network response was not ok ' + response.statusText);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('There has been a problem with your fetch operation:', error);
    }
}

function calculateTTD(startTime, endTime, url) {
    if (!startTime || startTime === 'N/A') {
        return { ttd: 'N/A', diffMs: NaN, url: url, failTime: endTime }; // No valid start time
    }

    const startDate = new Date(startTime);
    const endDate = new Date(endTime);

    const diffMs = endDate - startDate;

    if (diffMs < 0) {
        return { ttd: 'N/A', diffMs: NaN, url: url, failTime: endTime }; // Special case for negative intervals
    }

    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const diffSecs = Math.floor((diffMs % (1000 * 60)) / 1000);
    const ttdFormatted = `${diffHrs} hours, ${diffMins} minutes, ${diffSecs} seconds`;

    return { ttd: ttdFormatted, diffMs: diffMs, url: url, failTime: endTime };
}

function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

function mean(arr) {
    const total = arr.reduce((acc, curr) => acc + curr, 0);
    return total / arr.length;
}

function percentile(arr, percentile) {
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * (sorted.length - 1));
    return sorted[index];
}

function formatTTD(ttdInMs) {
    const diffHrs = Math.floor(ttdInMs / (1000 * 60 * 60));
    const diffMins = Math.floor((ttdInMs % (1000 * 60 * 60)) / (1000 * 60));
    const diffSecs = Math.floor((ttdInMs % (1000 * 60)) / 1000);
    return `${diffHrs} hours, ${diffMins} minutes, ${diffSecs} seconds`;
}

function updateSummary(data, meanId, p75Id, p90Id) {
    if (data.length === 0) {
        document.getElementById(meanId).textContent = 'N/A';
        document.getElementById(p75Id).textContent = 'N/A';
        document.getElementById(p90Id).textContent = 'N/A';
        return;
    }

    const ttData = data.map(item => item.diffMs);

    document.getElementById(meanId).textContent = formatTTD(mean(ttData));
    document.getElementById(p75Id).textContent = formatTTD(percentile(ttData, 75));
    document.getElementById(p90Id).textContent = formatTTD(percentile(ttData, 90));
}

function updateTTDSummaries() {
    ttdDataLast14Days = [];
    ttdDataLast30Days = [];

    const today = new Date();
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 14);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    Object.keys(MTTD_data).forEach(key => {
        const data = MTTD_data[key];
        let ttdData;
        if (data.breaking_time_readable && data.breaking_time_readable !== 'N/A') {
            ttdData = calculateTTD(data.breaking_time_readable, data.build_fail_time, data.url);
        } else {
            ttdData = calculateTTD(data.build_time, data.build_fail_time, data.url);
        }

        if (!isNaN(ttdData.diffMs)) {
            const buildFailDate = new Date(data.build_fail_time);

            if (buildFailDate >= fourteenDaysAgo) {
                ttdDataLast14Days.push(ttdData);
            }
            if (buildFailDate >= thirtyDaysAgo) {
                ttdDataLast30Days.push(ttdData);
            }
        }
    });

    updateSummary(ttdDataLast14Days, 'mean-ttd-14', 'p75-ttd-14', 'p90-ttd-14');
    updateSummary(ttdDataLast30Days, 'mean-ttd-30', 'p75-ttd-30', 'p90-ttd-30');
    console.log("ttdDataLast14Days")
    console.log(ttdDataLast14Days)
    console.log("ttdDataLast30Days")
    console.log(ttdDataLast30Days)
}

function generateTable(page = 1) {
    const tableBody = document.getElementById('table-body');
    tableBody.innerHTML = ''; // Clear existing table rows first
    const sortedDataKeys = Object.keys(MTTD_data).sort((a, b) => {
        const dateA = new Date(MTTD_data[a].build_fail_time);
        const dateB = new Date(MTTD_data[b].build_fail_time);
        return dateB - dateA;
    });

    const startIdx = (page - 1) * buildsPerPage;
    const endIdx = Math.min(startIdx + buildsPerPage, totalBuilds);
    const buildsToShow = sortedDataKeys.slice(startIdx, endIdx);

    buildsToShow.forEach(key => {
        const data = MTTD_data[key];
        const row = document.createElement('tr');

        const buildIdCell = document.createElement('td');
        const buildLink = document.createElement('a');
        buildLink.textContent = key;
        buildLink.href = data.url;
        buildIdCell.appendChild(buildLink);
        row.appendChild(buildIdCell);

        const offendingCommitCell = document.createElement('td');
        const offendingLink = document.createElement('a');
        if (data.breaking_id) {
            if (/^[0-9a-f]{40}$/.test(data.breaking_id)) { // is a commit id
                offendingLink.href = `https://github.com/scaledata/sdmain/commit/${data.breaking_id}`;
            } else { // is a PR link
                offendingLink.href = data.breaking_id;
            }
            offendingLink.textContent = data.breaking_id;
            offendingCommitCell.appendChild(offendingLink);
        } else {
            offendingCommitCell.textContent = 'N/A';
        }
        row.appendChild(offendingCommitCell);

        const breakingTimeReadableCell = document.createElement('td');
        breakingTimeReadableCell.textContent = data.breaking_time_readable ? formatDateTime(data.breaking_time_readable) : 'N/A';
        row.appendChild(breakingTimeReadableCell);

        const buildStartTimeCell = document.createElement('td');
        buildStartTimeCell.textContent = formatDateTime(data.build_time);
        row.appendChild(buildStartTimeCell);

        const buildFailTimeCell = document.createElement('td');
        buildFailTimeCell.textContent = formatDateTime(data.build_fail_time);
        row.appendChild(buildFailTimeCell);

        const ttdCell = document.createElement('td');
        let ttdData;
        if (data.breaking_time_readable && data.breaking_time_readable !== 'N/A') {
            ttdData = calculateTTD(data.breaking_time_readable, data.build_fail_time, data.url);
        } else {
            ttdData = calculateTTD(data.build_time, data.build_fail_time, data.url);
        }

        ttdCell.textContent = ttdData.ttd;
        row.appendChild(ttdCell);

        const offendingPRFoundCell = document.createElement('td');
        offendingPRFoundCell.textContent = data.foundPR ? 'Yes' : 'No';
        row.appendChild(offendingPRFoundCell);

        tableBody.appendChild(row);
    });

    updatePaginationControls(page);
}

function updatePaginationControls(page) {
    const paginationContainer = document.getElementById('pagination-controls');
    paginationContainer.innerHTML = ''; // Clear existing controls

    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.textContent = i;
        pageBtn.className = i === page ? 'active' : '';
        pageBtn.addEventListener('click', () => {
            currentPage = i;
            generateTable(currentPage);
        });
        paginationContainer.appendChild(pageBtn);
    }
}

function toggleDescription() {
    const toggleButton = document.querySelector('.description-toggle');
    const descriptionContent = document.querySelector('.description-content');

    toggleButton.addEventListener('click', () => {
        if (descriptionContent.style.display === 'none' || descriptionContent.style.display === '') {
            descriptionContent.style.display = 'block';
            toggleButton.textContent = 'Hide Description ▲';
        } else {
            descriptionContent.style.display = 'none';
            toggleButton.textContent = 'Show Description ▼';
        }
    });
}

async function load_content() {
    MTTD_data = await fetchMTTDData();
    if (MTTD_data) {
        totalBuilds = Object.keys(MTTD_data).length;
        totalPages = Math.ceil(totalBuilds / buildsPerPage);
        updateTTDSummaries();
        generateTable(currentPage);
    }
}

document.addEventListener('DOMContentLoaded', (event) => {
    load_content();
    toggleDescription();
});