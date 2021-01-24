/**
 * index.js
 * Server file for the web application.
 * Deals with communicating with the clients, sockets, and file transfer, and interaction with the python code for preprocessing steps.
 */
const express = require('express'); // express
const path = require('path');
const fs = require('fs');   // to read and write client files
const spawn = require('child_process').spawn;   // to run python code

const port = 3000;
const app = express();  // express server

app.use(express.static('client/build'));
app.use(require('compression')());
app.use(require('helmet')());
app.use(require('cors')());

const httpServer = require('http').createServer(app);

const io = require('socket.io')(httpServer, {
    cors: {
        origin: 'web-app.li-vincent.com:3000',
        methods: ['GET', 'POST'],
        allowedHeaders: ['steps', 'num of files', 'file chunk', 'submit'],
        credentials: true
    }
});    // initialize socket.io for server

// on getting root directory
app.get('/', (request, response) => {
    response.set('Cache-Control', 'public, max-age=300, s-maxage=600');
    response.sendFile(path.join(__dirname, 'client/build/index.html'));
});

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
        let cIndex = getClientIndex(socket.id);
        clients[cIndex].steps = stepsSubmitted;
        //console.log(clients);
    });

    // received number of files
    socket.on('num of files', (numSubmitted, callback) => {
        callback('Acknowledged number of files');
        // update numOfFiles
        let cIndex = getClientIndex(socket.id);
        clients[cIndex].numOfFiles = numSubmitted;
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
        callback(`Acknowledged submit`);
        let clientDirectory = 'temp/' + socket.id;
        // find this client's info
        let cIndex = getClientIndex(socket.id);
        // write files
        writeFiles(cIndex, clientDirectory);
        // preprocess files
        preprocess(cIndex, clientDirectory);

    });

    // client disconnected
    socket.on('disconnect', () => {
        console.log(`${socket.id}: Disconnected.`);
        // remove corresponding clientForm
        let cIndex = getClientIndex(socket.id);
        // delete client
        deleteClient(cIndex, socket.id);

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
    steps: null,    // sent steps
    files: [],   // sent files
    numOfFiles: 0,  // number of files that will be sent by server
    numOfReceivedFiles: 0   // number of files fully received
}

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
    let fIndex;
    // if there are no files for this client yet
    if(clients[cIndex].files.length === 0) {
        // push this filechunk to files
        clients[cIndex].files.push(fileChunk);
        fIndex = 0;
    }
    else {
        // find the existing file with the same filename
        for(let j in clients[cIndex].files) {
            if(clients[cIndex].files[j].name === fileChunk.name) {
                fIndex = j;
                break;
            }
        }
        if(fIndex === undefined) { // if this is the first filechunk for this file
            // push this filechunk to files
            clients[cIndex].files.push(fileChunk);
            fIndex = clients[cIndex].files.length - 1;
        }
        else {
            let data = clients[cIndex].files[fIndex].data;
            clients[cIndex].files[fIndex].data = Buffer.concat([data, fileChunk.data]); 
        }
    }
    // check if the file has all of its chunks
    if(clients[cIndex].files[fIndex].data.length === clients[cIndex].files[fIndex].size) {
        //console.log('Full file received');
        // increment client's numOfReceivedFiles
        clients[cIndex].numOfReceivedFiles++;
        //console.log(clients[cIndex]);
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
        fs.writeFile(clientDirectory + '/' + 'prep_' + clients[cIndex].files[i].name, clients[cIndex].files[i].data, (error) => {
            if(error) throw error;
        });
    }
}

/**
 * Performs the preprocessing steps on each file using the preprocess.py
 */
function preprocess(cIndex, clientDirectory) {
    // create an array of filenames
    let filenames = [];
    for(let i = 0; i < clients[cIndex].numOfReceivedFiles; i++) {
        filenames.push(clientDirectory + '/' + 'prep_' + clients[cIndex].files[i].name);
    }
    let filenamesJSON = JSON.stringify(filenames);
    // turn steps to string
    let stepsJSON = JSON.stringify(clients[cIndex].steps);
    // preprocess each file
    let prep = spawn('python', ['preprocess.py', filenamesJSON, stepsJSON]);
    prep.stdout.on('data', (data) => {
        console.log('OK:\n' + data.toString());
    });
    prep.stderr.on('data', (data) => {
        console.log('Error:\n' + data.toString());
    });
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
    fs.rmdir('temp/' + socketID, {recursive: true}, (error) => {
        if(error) console.log(error);
    });
}