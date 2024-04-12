# FedLex Scraper

This project is a legal text scraper built using Node.js and Puppeteer. It is designed to automate the process of scraping legal documents from specified URLs, extract meaningful data such as law texts and articles, and store this data in a MySQL database.

## Features

- **Web Scraping**: Automatically navigates through web pages to gather legal text and articles.
- **Data Extraction**: Extracts detailed information including law text details, articles, and their associated metadata.
- **Database Integration**: Stores extracted data into MySQL database with robust data handling.
- **Error Logging**: Logs errors systematically into the database for troubleshooting and monitoring.

## Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/en/download/) (v10 or higher)
- [npm](https://www.npmjs.com/get-npm) (typically installed with Node.js)
- [MySQL](https://dev.mysql.com/downloads/mysql/)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/mesopotato/fedlex.git
   cd fedlex

2. Install dependencies:
    ```bash 
    npm install

3. Set up your environment variables
    - create a .env file for the DB credentials

4. create nescessary tables 
    there are functions in the db.js modules for that 

5. run the scraper 
    ```bash 
    node scraper.js 