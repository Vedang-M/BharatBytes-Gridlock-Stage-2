import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { getTemporalData, getForecast, getViolationTypes, getVehicleTypes } from '../api/backendApi';

export const generateDashboardPDF = async ({ summary, hotspots, schedule, chartElements }) => {
  // Fetch additional analytics data for the comprehensive report
  let forecast = [];
  let violations = [];
  let vehicles = [];
  try {
    const [fc, vi, ve] = await Promise.all([
      getForecast().catch(() => []),
      getViolationTypes().catch(() => []),
      getVehicleTypes().catch(() => [])
    ]);
    forecast = fc;
    violations = vi;
    vehicles = ve;
  } catch (err) {
    console.error("Failed to fetch extended analytics for PDF:", err);
  }

  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  let currentY = 20;

  // ── HEADER ────────────────────────────────────────────────────────
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('ParkIQ Traffic Enforcement Report', 14, currentY);
  
  currentY += 8;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`Bengaluru Traffic Police · Generated on: ${new Date().toLocaleDateString()}`, 14, currentY);
  currentY += 15;

  // ── KEY METRICS ───────────────────────────────────────────────────
  if (summary) {
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('Key Metrics', 14, currentY);
    currentY += 8;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    
    const metrics = [
      ['Total Violations', summary.total_violations?.toLocaleString() || '-'],
      ['Hotspot Clusters', summary.total_clusters?.toLocaleString() || '-'],
      ['Critical Zones', summary.critical_zones?.toLocaleString() || '-'],
      ['Daily ROI (Top 10)', `Rs. ${summary.top10_roi?.toLocaleString() || '-'}`],
      ['Peak-Hour Share', `${summary.peak_pct || '-'}%`]
    ];

    autoTable(doc, {
      startY: currentY,
      head: [['Metric', 'Value']],
      body: metrics,
      theme: 'grid',
      headStyles: { fillColor: [60, 60, 60] },
      styles: { fontSize: 11 },
      margin: { left: 14 }
    });

    currentY = doc.lastAutoTable.finalY + 15;
  }

  // ── TOP 10 CRITICAL ZONES ─────────────────────────────────────────
  if (hotspots && hotspots.length > 0) {
    if (currentY > 250) { doc.addPage(); currentY = 20; }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('Top 10 Critical Zones', 14, currentY);
    currentY += 8;

    const topZones = hotspots.slice(0, 10).map((h, i) => [
      i + 1,
      h.top_junction || 'Unknown',
      h.CCS_category || '-',
      `${h.CCS?.toFixed(1) || '-'} / 10`,
      h.violations || '-'
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Rank', 'Location', 'Category', 'CCS Score', 'Violations']],
      body: topZones,
      theme: 'striped',
      headStyles: { fillColor: [239, 68, 68] },
      styles: { fontSize: 10 },
      margin: { left: 14 }
    });

    currentY = doc.lastAutoTable.finalY + 15;
  }

  // ── DEPLOYMENT SCHEDULE ───────────────────────────────────────────
  if (schedule && schedule.length > 0) {
    if (currentY > 250) { doc.addPage(); currentY = 20; }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('Deployment Schedule', 14, currentY);
    currentY += 8;

    const scheduleData = schedule.map(s => [
      s.top_junction || 'Unknown',
      s.deploy_window || '-',
      s.priority || '-'
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Zone / Location', 'Time Window', 'Priority']],
      body: scheduleData,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] },
      styles: { fontSize: 10 },
      margin: { left: 14 }
    });

    currentY = doc.lastAutoTable.finalY + 15;
  }

  // ── CHARTS (from Overview) ────────────────────────────────────────
  if (chartElements && chartElements.length > 0) {
    for (let i = 0; i < chartElements.length; i++) {
      const el = chartElements[i];
      if (!el) continue;

      if (currentY > 200) { doc.addPage(); currentY = 20; }

      try {
        const canvas = await html2canvas(el, { scale: 2, logging: false });
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = pageWidth - 28;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0);
        
        if (i === 0) doc.text('CCS Distribution', 14, currentY);
        else if (i === 1) doc.text('#1 Hotspot Profile', 14, currentY);
        
        currentY += 8;
        doc.addImage(imgData, 'PNG', 14, currentY, imgWidth, imgHeight);
        currentY += imgHeight + 15;
      } catch (err) {
        console.error("Error capturing chart:", err);
      }
    }
  }

  // ── ANALYTICS & HOTSPOTS DATA ─────────────────────────────────────
  doc.addPage();
  currentY = 20;
  
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('Analytics & Comprehensive Data', 14, currentY);
  currentY += 15;

  // Forecast
  if (forecast && forecast.length > 0) {
    doc.setFontSize(16);
    doc.text('Next 7-Day Risk Forecast', 14, currentY);
    currentY += 8;

    const forecastData = forecast.map(f => [
      f.date || '-', f.day || '-', f.risk || '-', f.peak_hours || '-', (f.top_zone || '').slice(0, 30)
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Date', 'Day', 'Risk Level', 'Peak Hours', 'Top Risk Zone']],
      body: forecastData,
      theme: 'grid',
      headStyles: { fillColor: [139, 92, 246] }, // Purple
      styles: { fontSize: 10 },
      margin: { left: 14 }
    });
    currentY = doc.lastAutoTable.finalY + 15;
  }

  // Violation Types
  if (violations && violations.length > 0) {
    if (currentY > 240) { doc.addPage(); currentY = 20; }
    doc.setFontSize(16);
    doc.text('Top Violation Types Breakdown', 14, currentY);
    currentY += 8;

    const vData = violations.slice(0, 15).map(v => [
      (v.vtype_list || '').slice(0, 60),
      v.count?.toLocaleString() || '-'
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Violation Type', 'Total Count']],
      body: vData,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] }, // Indigo
      styles: { fontSize: 10 },
      margin: { left: 14 }
    });
    currentY = doc.lastAutoTable.finalY + 15;
  }

  // Vehicle Types
  if (vehicles && vehicles.length > 0) {
    if (currentY > 240) { doc.addPage(); currentY = 20; }
    doc.setFontSize(16);
    doc.text('Vehicle Type Distribution', 14, currentY);
    currentY += 8;

    const vehData = vehicles.map(v => [
      v.vehicle || '-',
      v.count?.toLocaleString() || '-'
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Vehicle Classification', 'Total Count']],
      body: vehData,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] }, // Emerald
      styles: { fontSize: 10 },
      margin: { left: 14 }
    });
    currentY = doc.lastAutoTable.finalY + 15;
  }

  // Extended Hotspots (Top 30)
  if (hotspots && hotspots.length > 10) {
    doc.addPage();
    currentY = 20;
    doc.setFontSize(16);
    doc.text('Extended Hotspots Directory (Top 30)', 14, currentY);
    currentY += 8;

    const extendedZones = hotspots.slice(0, 30).map((h, i) => [
      i + 1,
      (h.top_junction || 'Unknown').slice(0, 40),
      h.CCS_category || '-',
      `${h.CCS?.toFixed(1) || '-'}`,
      h.violations?.toLocaleString() || '-',
      `${h.peak_pct || '-'}%`
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Rank', 'Location / Junction', 'Category', 'CCS', 'Violations', 'Peak %']],
      body: extendedZones,
      theme: 'striped',
      headStyles: { fillColor: [249, 115, 22] }, // Orange
      styles: { fontSize: 9 },
      margin: { left: 14 }
    });
  }

  doc.save(`ParkIQ_Comprehensive_Report_${new Date().toISOString().split('T')[0]}.pdf`);
};
