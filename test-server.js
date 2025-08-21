const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  
  // Handle directory requests
  if (!fs.existsSync(filePath) && !path.extname(filePath)) {
    filePath = path.join(filePath, 'index.html');
  }
  
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    let contentType = 'text/html';
    
    switch(ext) {
      case '.css': contentType = 'text/css'; break;
      case '.js': contentType = 'application/javascript'; break;
      case '.json': contentType = 'application/json'; break;
      case '.woff2': contentType = 'font/woff2'; break;
    }
    
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const port = 8080;
server.listen(port, () => {
  console.log(`Test server running at http://localhost:${port}`);
  console.log('Test i18n by opening http://localhost:8080 and using the language selector');
  console.log('Press Ctrl+C to stop');
});