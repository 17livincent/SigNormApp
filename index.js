/**
 * index.js
 * @author Vincent Li <vincentl@asu.edu>
 * Server file for the web application.
 * Deals with communicating with the clients, sockets, and file transfer, and interaction with the python code for preprocessing steps.
 */
const express = require('express'); // express
const path = require('path');
const fs = require('fs');   // to read and write client files
const spawn = require('child_process').spawn;   // to run python code
const archiver = require('archiver');   // for file compression

const port = 3000;

const app = express();  // express server
app.use(express.static('client/build'));
app.use(require('compression')());
app.use(require('helmet')());
app.use(require('cors')());

const httpServer = require('http').createServer(app);

const io = require('socket.io')(httpServer);    // initialize socket.io for server

// on getting root directory
app.get('/', (request, response) => {
    response.set('Cache-Control', 'public, max-age=300, s-maxage=600');
    response.sendFile(path.join(__dirname, 'client/build/index.html'));
});

// client requests download of zip of preprocessed files
app.get('/download/:id', (request, response) => {
    // get socket ID from route parameters
    let id = request.params.id;     
    console.log('Download request from ' + id);
    // send zip folder as download
    response.download('temp/' + id + resultsZip);  
});

// client requests a graph image
app.get('/graphs/:id/:filename/:when/:type', (request, response) => {
    // get socket ID
    let id = request.params.id;
    // get the filename of the data the graph is about
    let filename = request.params.filename;
    // get 'orig' or 'prep'
    let when = request.params.when;
    // get the type of graph requested
    let type = request.params.type;
    //console.log(`${id} ${filename} ${when} ${type}`);
    // format for graph file name on server is temp/<socket ID>/<type>-<when>-<filename>.png
    response.sendFile(__dirname + '/temp/' + id + '/' + type + '-' + when + '-prep_' + filename + '.png');
});

// fun stats/analytics page
app.get('/stats', (request, response) => {
    response.send(`
        <h1>Stats</h1>
        <p>Number of users currently online: ${clients.length}</p>
    `);
});

// socket communication
io.on('connection', (socket) => {   // when a new client has connected
    console.log(`${socket.id}: Connected.`);
    // record client
    let client = Object.assign({}, clientForm);
    client.id = socket.id;
    clients.push(client);
    console.log(clients);
    // ack connection
    socket.emit('connection');

    // received steps from client
    socket.on('steps', (stepsSubmitted, callback) => {
        //console.log(`${socket.id}: Submitted steps: ${stepsSubmitted}`);
        // ack steps
        callback(`Acknowledged steps`);
        // add steps to clientForm
        clients[getClientIndex(socket.id)].steps = stepsSubmitted;
        //console.log(clients);
    });

    // received number of files
    socket.on('num of files', (numSubmitted, callback) => {
        callback('Acknowledged number of files');
        // update numOfFiles
        clients[getClientIndex(socket.id)].numOfFiles = numSubmitted;
    })

    // received file chunk from client
    socket.on('file chunk', (fileChunk, callback) => {
        callback(`Acknowledged file chunk`);
        // find client
        let cIndex = getClientIndex(socket.id);
        // add filechunk to clientForm
        addFileChunk(cIndex, fileChunk);
        // check if the client has sent all files
        if(clients[cIndex].numOfFiles !== 0 
            && clients[cIndex].numOfFiles === clients[cIndex].numOfReceivedFiles
            && clients[cIndex].steps !== null) {
            // send request to submit
            socket.emit('ready to submit');
        }
    });

    // received submit from client
    socket.on('submit', (callback) => {
        let clientDirectory = 'temp/' + socket.id;
        // find this client's info
        let cIndex = getClientIndex(socket.id);
        // write files
        writeFiles(cIndex, clientDirectory);
        // preprocess files and then compress
        preprocess(cIndex, clientDirectory, 
            () => compress(clientDirectory, () => socket.emit('download')), // success callback
            () => socket.emit('error')  // failure callback
        );
    });

    // client disconnected
    socket.on('disconnect', () => {
        console.log(`${socket.id}: Disconnected.`);
        // delete client
        deleteClient(getClientIndex(socket.id), socket.id);
        console.log(clients);
    });
});

httpServer.listen(port, () => {
    console.log(`Listening on port ${port}:`);
});

// backend code

let clients = [];   // list of clientForms

let clientForm = {  // details associated with a connected client
    id: null,   // socket ID
    steps: [],    // sent steps
    files: [],   // sent files
    numOfFiles: 0,  // number of files that will be sent by the client
    numOfReceivedFiles: 0   // number of files fully received
}

const prefix = 'prep_';
const resultsZip = '/preprocessed.zip';

/**
 * Returns the index in clients of the client with the matching @param socketID
 */
function getClientIndex(socketID) {
    for(let i in clients) {
        if(clients[i].id === socketID) {
            return i;
        }
    }
}

/**
 * Adds the file chunk to the client's corresponding file
 */
function addFileChunk(cIndex, fileChunk) {
    fileChunk.data = Buffer.from(new Uint8Array(fileChunk.data));
    let fIndex;
    // if there are already files of this user
    if(clients[cIndex].files.length > 0) {
        // find the existing file with the same filename
        for(let j in clients[cIndex].files) {
            if(clients[cIndex].files[j].name === fileChunk.name) {
                fIndex = j;
                break;
            }
        }
        if(fIndex !== undefined) {  // if this is not the first filechunk for this file
            clients[cIndex].files[fIndex].data = Buffer.concat([clients[cIndex].files[fIndex].data, fileChunk.data]); 
        }
        else {  // if this is the first filechunk for this file
            // push this filechunk to files
            clients[cIndex].files.push(fileChunk);
            fIndex = clients[cIndex].files.length - 1;
        }
    }
    else {  // if the client has not uploaded any chunks yet
        // push this filechunk to files
        clients[cIndex].files.push(fileChunk);
        fIndex = 0;
    }
    // check if the file has all of its chunks
    if(clients[cIndex].files[fIndex].data.length === clients[cIndex].files[fIndex].size) {
        //console.log('Full file received');
        // increment client's numOfReceivedFiles
        clients[cIndex].numOfReceivedFiles++;
        console.log(clients[cIndex]);
    }
}

/**
 * Writes the client's files into a directory named after its socket.id
 * New files have a prefix 'prep_' to each name
 */
function writeFiles(cIndex, clientDirectory) {
    // make a directory for this client's files with its name equalling the socket.id
    fs.mkdirSync(clientDirectory);
    // write files to this directory
    for(let i = 0; i < clients[cIndex].files.length; i++) {
        // create WriteStream to file
        let writeStream = fs.createWriteStream(clientDirectory + '/' + prefix + clients[cIndex].files[i].name);
        // write buffer to file
        writeStream.write(clients[cIndex].files[i].data);
        writeStream.end();
    }
}

/**
 * Performs the preprocessing steps on each file using the preprocess.py
 */
function preprocess(cIndex, clientDirectory, success, failure) {
    // create an array of filenames
    let filenames = [];
    for(let i = 0; i < clients[cIndex].numOfReceivedFiles; i++) {
        filenames.push(clientDirectory + '/' + prefix + clients[cIndex].files[i].name);
    }
    // turn filenames into string
    let filenamesJSON = JSON.stringify(filenames);
    // turn steps into string
    let stepsJSON = JSON.stringify(clients[cIndex].steps);
    // preprocess each file
    let prep = spawn('python3', ['preprocess.py', filenamesJSON, stepsJSON]);
    prep.stdout.on('data', (data) => {
        console.log('OK:\n' + data.toString());
    });
    prep.stderr.on('data', (data) => {
        console.log('Error:\n' + data.toString());
    });
    prep.on('close', (code) => {    // process completed successfully
        console.log(`Process complete: ${code}`);
        if(code === 0) {    // preprocessing successful
            success();
        }
        if(code === 1) {    // an error occurred
            failure();
        }
    });
}

/**
 * Compresses the preprocessed files (prefix 'prep_') in the @param clientDirectory
 */
function compress(clientDirectory, callback) {
    const out = fs.createWriteStream(clientDirectory + resultsZip);
    const zipper = archiver('zip', {
        zlib: {level: 5}
    });

    out.on('close', () => {
        //console.log(zipper.pointer() + ' total bytes');
        console.log('Compressed');
        callback();
    });
    zipper.on('warning', (error) => {
        if(err.code === 'ENOENT') {
            console.log(error);
        }
        else {
            throw error;
        }
    });
    zipper.pipe(out);
    // include all files with 'prep_' prefix
    zipper.glob(prefix + '*', {cwd: clientDirectory})
    zipper.finalize();
}

/**
 * Removes the files and clientForm of the client with the given @param cIndex
 */
function deleteClient(cIndex, socketID) {
    // delete files in clientForm
    clients[cIndex].files.splice(0, clients[cIndex].files.length);
    // remove clientForm
    clients.splice(cIndex, 1);
    // remove client's temporary directory and its files
    fs.rm('temp/' + socketID, {recursive: true, force: true}, (error) => {
        if(error) throw error;
    });
}