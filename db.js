const mysql = require('mysql');
require('dotenv').config(); // Load environment variables from .env file

class Database {
    constructor() {
        this.connection = mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        this.connect();
    }

    connect() {
        this.connection.connect(err => {
            if (err) {
                console.error('Error connecting to the database: ' + err.stack);
                return;
            }
            console.log('Connected to database with thread ID: ', this.connection.threadId);
        });
    }

    createTables() {
        const createLawTextTable = `
            CREATE TABLE IF NOT EXISTS lawText (
                id INT AUTO_INCREMENT PRIMARY KEY,
                insert_tsd TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                srnNummer VARCHAR(35),
                title TEXT,
                preface TEXT,
                preamble TEXT,
                status VARCHAR(35),
                shortName VARCHAR(35),
                beschlussDate VARCHAR(35),
                inkrafttretenDate VARCHAR(35),
                quelleName VARCHAR(35),
                chronologieLink VARCHAR(255),
                changesLink VARCHAR(255), 
                sourceLink VARCHAR(255),  
                quelleLink VARCHAR(255)
            )`;

        const createArticlesTable = `
            CREATE TABLE IF NOT EXISTS articles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                insert_tsd TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                srnNummer VARCHAR(35),
                shortName VARCHAR(35),
                article_id VARCHAR(35),
                article_name TEXT,
                absatz VARCHAR(255),
                text_w_footnotes MEDIUMTEXT
            )`;

        this.connection.query(createLawTextTable, (err, results, fields) => {
            if (err) throw err;
            console.log('LawText table created or already exists.');
        });

        this.connection.query(createArticlesTable, (err, results, fields) => {
            if (err) throw err;
            console.log('Articles table created or already exists.');
        });
    }

    createErrorTable() {
        const createErrorTableSQL = `
            CREATE TABLE IF NOT EXISTS errorLog (
                id INT AUTO_INCREMENT PRIMARY KEY,
                insert_tsd TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                srnNummer VARCHAR(35),
                error_text MEDIUMTEXT
            )`;
    
        this.connection.query(createErrorTableSQL, (err, results, fields) => {
            if (err) {
                console.error('Error creating errorLog table:', err);
                return;
            }
            console.log('ErrorLog table created or already exists.');
        });
    }

    dropTable(tableName) {
        const query = `DROP TABLE IF EXISTS ${mysql.escapeId(tableName)};`;
        this.connection.query(query, (err, results) => {
            if (err) {
                console.error(`Error dropping ${tableName} table: ` + err);
                return;
            }
            console.log(`${tableName} table dropped.`);
        });
    }

    insertOrUpdateLawText(data) {
        const defaults = {
            srnNummer: '', 
            title: '', 
            preface: '', 
            preamble: '', 
            status: '',
            shortName: '', 
            beschlussDate: '', 
            inkrafttretenDate: '',
            quelleName: '',
            chronologieLink: '',
            changesLink: '',
            sourceLink: '',
            quelleLink: ''
        };
    
        // Fill in defaults where necessary
        const completeData = { ...defaults, ...data };
    
        return new Promise((resolve, reject) => {
            // First, check if an entry exists with the same srnNummer
            const selectQuery = `SELECT * FROM lawText WHERE srnNummer = ?`;
            this.connection.query(selectQuery, [completeData.srnNummer], (selectErr, selectResults) => {
                if (selectErr) {
                    console.error('Error checking for existing lawText:', selectErr);
                    this.insertError(completeData.srnNummer, selectErr);
                    reject(selectErr);
                    return;
                }
    
                if (selectResults.length > 0) {
                    // Entry exists, compare and decide whether to update
                    const existingData = selectResults[0];
                    let needsUpdate = false;
                    let updateSet = [];
    
                    // Prepare an update query if necessary
                    for (let key in completeData) {
                        if (completeData[key] !== existingData[key] && completeData[key] !== '' && completeData[key] != null) {
                            needsUpdate = true;
                            updateSet.push(`${key} = ${mysql.escape(completeData[key])}`);
                        }
                    }
    
                    if (needsUpdate) {
                        const updateQuery = `UPDATE lawText SET ${updateSet.join(', ')} WHERE srnNummer = ${mysql.escape(completeData.srnNummer)}`;
                        this.connection.query(updateQuery, (updateErr, updateResults) => {
                            if (updateErr) {
                                console.error('Error updating lawText:', updateErr);
                                this.insertError(completeData.srnNummer, updateErr);
                                reject(updateErr);
                            } else {
                                console.log(`LawText updated with ID: ${existingData.id}`);
                                resolve(updateResults);
                            }
                        });
                    } else {
                        resolve({ message: 'No update needed', ...existingData });
                    }
                } else {
                    // No existing entry, insert new
                    const insertQuery = `INSERT INTO lawText (srnNummer, title, preface, preamble, status, shortName, beschlussDate, inkrafttretenDate, quelleName, chronologieLink, changesLink, sourceLink, quelleLink) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                    this.connection.query(insertQuery, Object.values(completeData), (insertErr, insertResults) => {
                        if (insertErr) {
                            console.error('Error inserting new lawText:', insertErr);
                            this.insertError(completeData.srnNummer, insertErr);
                            reject(insertErr);
                        } else {
                            console.log(`LawText inserted with ID: ${insertResults.insertId}`);
                            resolve(insertResults);
                        }
                    });
                }
            });
        });
    }

    insertArticle(data) {
        const defaults = {
            srnNummer: '', 
            shortName: '', 
            article_id: '', 
            article_name: '',
            absatz: '', 
            text_w_footnotes: ''
        };
    
        const completeData = { ...defaults, ...data };
    
        return new Promise((resolve, reject) => {
            // Construct the query to check for existing records
            const checkQuery = `SELECT * FROM articles WHERE srnNummer = ? AND shortName = ? AND article_id = ? AND article_name = ? AND absatz = ? AND text_w_footnotes = ?`;
            this.connection.query(checkQuery, [completeData.srnNummer, completeData.shortName, completeData.article_id, completeData.article_name, completeData.absatz, completeData.text_w_footnotes], (checkErr, checkResults) => {
                if (checkErr) {
                    console.error('Error checking for existing article:', checkErr);
                    this.insertError(completeData.srnNummer, checkErr);
                    reject(checkErr);
                } else if (checkResults.length > 0) {
                    // If there is a duplicate, resolve without inserting
                    resolve({ message: 'No insert performed; duplicate found.', details: checkResults[0] });
                } else {
                    // No duplicate found, perform the insert
                    const insertQuery = `INSERT INTO articles (srnNummer, shortName, article_id, article_name, absatz, text_w_footnotes) VALUES (?, ?, ?, ?, ?, ?)`;
                    this.connection.query(insertQuery, Object.values(completeData), (insertErr, insertResults) => {
                        if (insertErr) {
                            console.error('Error inserting new article:', insertErr);
                            this.insertError(completeData.srnNummer, insertErr);
                            reject(insertErr);
                        } else {
                            console.log(`Article inserted with ID: ${insertResults.insertId}`);
                            resolve(insertResults);
                        }
                    });
                }
            });
        });
    }

    insertError(srnNummer, errorText) {
        return new Promise((resolve, reject) => {
            const query = `INSERT INTO errorLog (srnNummer, error_text) VALUES (?, ?)`;
            this.connection.query(query, [srnNummer, errorText], (err, results) => {
                if (err) {
                    console.error('Error inserting into errorLog:', err);
                    reject(err);
                } else {
                    console.log(`Error logged with ID: ${results.insertId}`);
                    resolve(results);
                }
            });
        });
    }

    close() {
        return new Promise((resolve, reject) => {
            this.pool.end(err => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    query(sql, args) {
        return new Promise((resolve, reject) => {
            this.pool.query(sql, args, (err, results) => {
                if (err) return reject(err);
                resolve(results);
            });
        });
    }
}

module.exports = Database;
