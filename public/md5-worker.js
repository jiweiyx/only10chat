importScripts('https://cdn.jsdelivr.net/npm/spark-md5@3.0.2/spark-md5.min.js');

self.onmessage = (e) => {
    const { file } = e.data;
    const spark = new SparkMD5.ArrayBuffer();
    const reader = new FileReader();

    reader.onload = (event) => {
        spark.append(event.target.result);
        const md5 = spark.end();
        self.postMessage({ md5 });
    };

    reader.onerror = (err) => {
        self.postMessage({ error: 'File reading error' });
    };
    
    const fileSize = file.size;
    if (fileSize < 1 * 1024 * 1024) {
        reader.readAsArrayBuffer(file);
    } else {
        const firstPart = file.slice(0, 512 * 1024);
        const lastPart = file.slice(fileSize - 512 * 1024);
        const blob = new Blob([firstPart, lastPart]);
        reader.readAsArrayBuffer(blob);
    }
};