// app.js
// 負責：讀 CSV，然後交俾 trade-analyzer 做分析與顯示

document.addEventListener('DOMContentLoaded', () => {
  const btnParse = document.getElementById('btnParse');
  const fileInput = document.getElementById('csvFile');
  const btnExport = document.getElementById('btnExport');

  btnParse.addEventListener('click', () => {
    const file = fileInput.files[0];
    if (!file) {
      alert('請先揀 CSV 檔案');
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = res.data;
        onCsvParsed(rows); // 交俾 trade-analyzer.js
      },
      error: (err) => {
        console.error(err);
        alert('讀取 CSV 時發生錯誤');
      }
    });
  });

  btnExport.addEventListener('click', () => {
    if (!window.globalAnalysis || !window.globalTrades) {
      alert('請先上載並分析 CSV');
      return;
    }
    exportToExcel(window.globalAnalysis, window.globalTrades);
  });
});
