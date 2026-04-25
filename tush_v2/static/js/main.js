// Global Chart Instances
let incomeExpenseChart = null;
let prasadiChart = null;

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('incomeExpenseChart')) {
        const monthFilter = document.getElementById('monthFilter');
        updateDashboard(monthFilter.value);
        monthFilter.addEventListener('change', (e) => updateDashboard(e.target.value));
    }
});

async function updateDashboard(month) {
    try {
        const response = await fetch(`/api/stats?month=${month}`);
        const data = await response.json();
        document.getElementById('totalIncome').innerText = `₹${data.totalIncome.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
        document.getElementById('totalExpenses').innerText = `₹${data.totalExpenses.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
        const balanceEl = document.getElementById('netBalance');
        balanceEl.innerText = `₹${data.netBalance.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
        balanceEl.style.color = data.netBalance >= 0 ? 'var(--success)' : 'var(--danger)';
        document.getElementById('avgAttendance').innerText = data.avgAttendance;
        document.getElementById('prasadiTotal').innerText = `₹${data.prasadiExpenses.toLocaleString('en-IN')}`;
        document.getElementById('prasadiAvg').innerText = `₹${data.avgPrasadi.toLocaleString('en-IN')}`;
        renderCharts(data);
    } catch (error) {
        console.error('Error fetching stats:', error);
    }
}

function renderCharts(data) {
    const ieCtx = document.getElementById('incomeExpenseChart').getContext('2d');
    if (incomeExpenseChart) incomeExpenseChart.destroy();
    incomeExpenseChart = new Chart(ieCtx, {
        type: 'doughnut',
        data: {
            labels: ['Income', 'Expenses'],
            datasets: [{ data: [data.totalIncome, data.totalExpenses], backgroundColor: ['#6366f1', '#ef4444'], borderWidth: 0, hoverOffset: 10 }]
        },
        options: { plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { family: 'Inter' } } } }, cutout: '70%' }
    });

    const pCtx = document.getElementById('prasadiChart').getContext('2d');
    if (prasadiChart) prasadiChart.destroy();
    prasadiChart = new Chart(pCtx, {
        type: 'bar',
        data: {
            labels: ['Prasadi', 'Other'],
            datasets: [{ label: 'Expenses', data: [data.prasadiExpenses, data.totalExpenses - data.prasadiExpenses], backgroundColor: ['#10b981', '#f59e0b'], borderRadius: 8 }]
        },
        options: {
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function toggleDonationForm() {
    const form = document.getElementById('donationForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
}
function toggleExpenseForm() {
    const form = document.getElementById('expenseForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
}
function toggleAttendanceForm() {
    const form = document.getElementById('attendanceForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
}
function filterDonations(month) { window.location.href = `/donations?month=${month}`; }
function filterExpenses(month) { window.location.href = `/expenses?month=${month}`; }
function filterAttendance(month) { window.location.href = `/attendance?month=${month}`; }

async function deleteRecord(type, id) {
    if (confirm('Are you sure you want to delete this record?')) {
        try {
            const response = await fetch(`/api/delete/${type}/${id}`, { method: 'POST' });
            const result = await response.json();
            if (result.success) window.location.reload();
            else alert('Error deleting record: ' + result.error);
        } catch (error) { console.error('Delete error:', error); }
    }
}

// ─── Full Report Export ───────────────────────────────────────────────────────

async function exportFullReport() {
    const month = document.getElementById('monthFilter').value;
    const btn = document.querySelector('[onclick="exportFullReport()"]');
    const origHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    btn.disabled = true;

    try {
        const res = await fetch(`/api/report?month=${month}`);
        const d = await res.json();

        exportPDF(d, month);
        exportExcel(d, month);
    } catch(e) {
        alert('Error generating report: ' + e.message);
    } finally {
        btn.innerHTML = origHTML;
        btn.disabled = false;
    }
}

function fmt(n) { return '₹' + Number(n).toLocaleString('en-IN', {minimumFractionDigits: 2}); }

function exportPDF(d, month) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    let y = 0;

    // ── Header ──
    doc.setFillColor(99, 102, 241);
    doc.rect(0, 0, W, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20); doc.setFont('helvetica', 'bold');
    doc.text('SabhaAdmin', 14, 12);
    doc.setFontSize(11); doc.setFont('helvetica', 'normal');
    doc.text(`Monthly Report — ${month}`, 14, 21);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, W - 14, 21, { align: 'right' });
    y = 36;

    // ── Summary Cards ──
    const totalIncome   = d.donations.reduce((s, r) => s + r.amount, 0);
    const totalExpenses = d.expenses.reduce((s, r) => s + r.amount, 0);
    const netBalance    = totalIncome - totalExpenses;
    const totalAttendance = d.attendance.reduce((s, r) => s + r.count, 0);
    const avgAttendance = d.attendance.length ? (totalAttendance / d.attendance.length).toFixed(1) : 0;

    const cards = [
        { label: 'Total Income',    value: fmt(totalIncome),    color: [16,185,129] },
        { label: 'Total Expenses',  value: fmt(totalExpenses),  color: [239,68,68] },
        { label: 'Net Balance',     value: fmt(netBalance),     color: netBalance >= 0 ? [16,185,129] : [239,68,68] },
        { label: 'Avg Attendance',  value: String(avgAttendance), color: [99,102,241] },
    ];
    const cw = (W - 28 - 12) / 4;
    cards.forEach((c, i) => {
        const x = 14 + i * (cw + 4);
        doc.setFillColor(30, 41, 59); doc.roundedRect(x, y, cw, 20, 3, 3, 'F');
        doc.setDrawColor(...c.color); doc.setLineWidth(0.8);
        doc.roundedRect(x, y, cw, 20, 3, 3, 'S');
        doc.setTextColor(148, 163, 184); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.text(c.label.toUpperCase(), x + cw/2, y + 7, { align: 'center' });
        doc.setTextColor(...c.color); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
        doc.text(c.value, x + cw/2, y + 15, { align: 'center' });
    });
    y += 28;

    // Helper: section header
    function sectionHeader(title, iconChar) {
        if (y > 240) { doc.addPage(); y = 15; }
        doc.setFillColor(30, 41, 59);
        doc.rect(14, y, W - 28, 9, 'F');
        doc.setTextColor(99, 102, 241); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
        doc.text(title, 18, y + 6.5);
        y += 13;
    }

    // ── Donations Table ──
    sectionHeader('DONATIONS');
    if (d.donations.length) {
        doc.autoTable({
            startY: y,
            head: [['Date', 'Donor Name', 'Member', 'Amount', 'Mode']],
            body: d.donations.map(r => [r.date, r.donor_name, r.member, fmt(r.amount), r.payment_mode]),
            foot: [['', '', 'TOTAL', fmt(totalIncome), '']],
            theme: 'grid',
            headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold', fontSize: 8 },
            footStyles: { fillColor: [30, 41, 59], textColor: [16, 185, 129], fontStyle: 'bold', fontSize: 9 },
            bodyStyles: { fillColor: [15, 23, 42], textColor: [248, 250, 252], fontSize: 8 },
            alternateRowStyles: { fillColor: [20, 30, 50] },
            columnStyles: { 3: { halign: 'right' } },
            margin: { left: 14, right: 14 },
        });
        y = doc.lastAutoTable.finalY + 8;
    } else {
        doc.setTextColor(148, 163, 184); doc.setFontSize(9);
        doc.text('No donations recorded.', 18, y); y += 10;
    }

    // ── Expenses Table ──
    sectionHeader('EXPENSES');
    if (d.expenses.length) {
        doc.autoTable({
            startY: y,
            head: [['Date', 'Description', 'Category', 'Amount']],
            body: d.expenses.map(r => [r.date, r.description, r.category, fmt(r.amount)]),
            foot: [['', '', 'TOTAL', fmt(totalExpenses)]],
            theme: 'grid',
            headStyles: { fillColor: [239, 68, 68], textColor: 255, fontStyle: 'bold', fontSize: 8 },
            footStyles: { fillColor: [30, 41, 59], textColor: [239, 68, 68], fontStyle: 'bold', fontSize: 9 },
            bodyStyles: { fillColor: [15, 23, 42], textColor: [248, 250, 252], fontSize: 8 },
            alternateRowStyles: { fillColor: [20, 30, 50] },
            columnStyles: { 3: { halign: 'right' } },
            margin: { left: 14, right: 14 },
        });
        y = doc.lastAutoTable.finalY + 8;
    } else {
        doc.setTextColor(148, 163, 184); doc.setFontSize(9);
        doc.text('No expenses recorded.', 18, y); y += 10;
    }

    // ── Member Attendance Summary ──
    sectionHeader('MEMBER ATTENDANCE SUMMARY');
    if (d.members.length) {
        doc.autoTable({
            startY: y,
            head: [['Name', 'Phone', 'Total Donated', 'Present', 'Absent', 'Attendance %', 'Status']],
            body: d.members.map(m => {
                const total = m.present + m.absent;
                const pct = total ? Math.round((m.present / total) * 100) + '%' : '—';
                return [m.name, m.phone, fmt(m.total_donated), m.present, m.absent, pct, m.status];
            }),
            theme: 'grid',
            headStyles: { fillColor: [30, 41, 59], textColor: [99, 102, 241], fontStyle: 'bold', fontSize: 8 },
            bodyStyles: { fillColor: [15, 23, 42], textColor: [248, 250, 252], fontSize: 8 },
            alternateRowStyles: { fillColor: [20, 30, 50] },
            columnStyles: { 2: { halign: 'right' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' } },
            margin: { left: 14, right: 14 },
        });
        y = doc.lastAutoTable.finalY + 8;
    } else {
        doc.setTextColor(148, 163, 184); doc.setFontSize(9);
        doc.text('No members registered.', 18, y); y += 10;
    }

    // ── Footer on every page ──
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFillColor(15, 23, 42);
        doc.rect(0, doc.internal.pageSize.getHeight() - 10, W, 10, 'F');
        doc.setTextColor(148, 163, 184); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.text('SabhaAdmin — Confidential', 14, doc.internal.pageSize.getHeight() - 3.5);
        doc.text(`Page ${i} of ${pageCount}`, W - 14, doc.internal.pageSize.getHeight() - 3.5, { align: 'right' });
    }

    doc.save(`Sabha_Report_${month}.pdf`);
}

function exportExcel(d, month) {
    const wb = XLSX.utils.book_new();

    // ── Summary Sheet ──
    const totalIncome   = d.donations.reduce((s, r) => s + r.amount, 0);
    const totalExpenses = d.expenses.reduce((s, r) => s + r.amount, 0);
    const totalAtt      = d.attendance.reduce((s, r) => s + r.count, 0);
    const avgAtt        = d.attendance.length ? (totalAtt / d.attendance.length).toFixed(1) : 0;
    const summaryData = [
        ['Sabha Monthly Report', month],
        [],
        ['SUMMARY', ''],
        ['Total Income (₹)',    totalIncome],
        ['Total Expenses (₹)',  totalExpenses],
        ['Net Balance (₹)',     totalIncome - totalExpenses],
        ['Average Attendance',  avgAtt],
        ['Total Members',       d.members.length],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Summary');

    // ── Donations Sheet ──
    const donRows = [['Date', 'Donor Name', 'Member', 'Amount (₹)', 'Payment Mode'],
                     ...d.donations.map(r => [r.date, r.donor_name, r.member, r.amount, r.payment_mode]),
                     [], ['TOTAL', '', '', totalIncome, '']];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(donRows), 'Donations');

    // ── Expenses Sheet ──
    const expRows = [['Date', 'Description', 'Category', 'Amount (₹)'],
                     ...d.expenses.map(r => [r.date, r.description, r.category, r.amount]),
                     [], ['TOTAL', '', '', totalExpenses]];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expRows), 'Expenses');

    // ── Members Sheet ──
    const memRows = [['Name', 'Phone', 'Email', 'Address', 'Join Date', 'Status', 'Total Donated (₹)', 'Present', 'Absent', 'Attendance %'],
                     ...d.members.map(m => {
                         const total = m.present + m.absent;
                         const pct = total ? Math.round((m.present / total) * 100) + '%' : '—';
                         return [m.name, m.phone, m.email, m.address, m.join_date, m.status, m.total_donated, m.present, m.absent, pct];
                     })];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(memRows), 'Members');

    // ── Attendance Sheet ──
    const attRows = [['Date', 'Total Count'],
                     ...d.attendance.map(r => [r.date, r.count])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(attRows), 'Attendance');

    XLSX.writeFile(wb, `Sabha_Report_${month}.xlsx`);
}
