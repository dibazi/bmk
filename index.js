// Import required modules
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const flash = require('express-flash');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const qrcode = require('qrcode');
const moment = require('moment');
const dotenv = require('dotenv');
let result = dotenv.config();


const app = express();

app.use(express.urlencoded({ extended: true }));
// Create a new Express app
app.use(bodyParser.json());

const dbHost = process.env.DB_HOST;
const dbUser = process.env.DB_USERNAME;
const dbPassword = process.env.DB_PASSWORD;
const dbName = process.env.DB_DATABASE;

// Set up session middleware
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

//acces css file
app.use(express.static(__dirname = "public"));

// Set the view engine to EJS
app.set('view engine', 'ejs');

//app.post('/check_in', (req, res) => {
  // Process the check-in request and display an alert message
 // res.send("<script>alert('You are checked in');</script>");
//});


// Set up body-parser middleware
app.use(bodyParser.urlencoded({ extended: true }));

// Set up MySQL connection pool
const pool = mysql.createPool({
  host: dbHost,
  user: dbUser,
  password: dbPassword,
  database: dbName,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Middleware to check for a session
app.use((req, res, next) => {
  if (req.session.user || req.path === '/login' || req.path === '/register') {
    next();
  } else {
    res.redirect('/login');
  }
});

// Middleware to check for a session and pass user data to the views
app.use((req, res, next) => {
  res.locals.user = req.session.user; // Pass the user data to the views
  next();
});

// create user form
app.get('/register', (req, res) => {
  res.render('register.ejs');
});

// Process the registration form
app.post('/register', (req, res) => {
    const { user_name, email,password } = req.body;

    // Hash the password
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
            console.log(err);
            res.redirect('/register');
            return;
        }

        // Insert the user into the database
        pool.query('INSERT INTO bmk_user (user_name, email, password) VALUES (?, ?, ?)', [user_name, email,hash], (err, result) => {
            if (err) {
                console.log(err);
                res.redirect('/register');
                return;
            }

            res.redirect('/login');
        });
    });
});

//login route
app.get('/login', (req, res) => {
  res.render('login.ejs');
});

//login route
app.get('/', (req, res) => {
  res.render('createTransaction.ejs');
});

//login function
app.post('/login', (req, res) => {
  const { user_name, password } = req.body;

  pool.query('SELECT * FROM bmk_user WHERE user_name = ?', [user_name], async (error, results) => {
    if (error) {
      console.log(error);
      res.redirect('/login');
      return;
    }

    if (results.length === 0) {
      req.flash('error', 'Incorrect username');
      res.redirect('/login');
      return;
    }

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      req.flash('error', 'Incorrect password');
      res.redirect('/login');
      return;
    }

    req.session.user = user;
    res.redirect('/transactions');
  });
});

// create client form
app.get('/add-client', (req, res) => {
    res.render('createClient.ejs');
  });

  app.post('/add-client', (req, res) => {
    const { name, email, phone, address } = req.body;
    const query = 'INSERT INTO bmkclients (name, email, phone, address) VALUES (?, ?, ?, ?)';
    const values = [name, email, phone, address];
  
    // Execute the SQL query
    pool.query(query, values, (err, result) => {
      if (err) {
        console.error('Error inserting data into clients table: ', err);
        return;
      }
      console.log('Data inserted successfully');
      res.redirect('/clients'); // Redirect to the homepage or any other page
    });
  });

    // Set up a route to fetch and display data from the bmkclients table
app.get('/clients', (req, res) => {
    const query = 'SELECT * FROM bmkclients';
  
    // Execute the SQL query
    pool.query(query, (err, results) => {
      if (err) {
        console.error('Error fetching data from bmkclients table: ', err);
        return;
      }
  
      // Render the data using a template engine like EJS or send it as JSON
      res.render('showClients', { clients: results }); // Assuming you have set up your views folder for EJS templates
    });
  });

    // Set up a route to fetch and display data from the bmkclients table
app.get('/add-transaction', (req, res) => {
    const query = 'SELECT * FROM bmkclients';
  
    // Execute the SQL query
    pool.query(query, (err, results) => {
      if (err) {
        console.error('Error fetching data from bmkclients table: ', err);
        return;
      }
  
      // Render the data using a template engine like EJS or send it as JSON
      res.render('createTransaction', { clients: results }); // Assuming you have set up your views folder for EJS templates
    });
  });

  // Define route to handle form submission and insert the transaction data
app.post('/add-transaction', (req, res) => {
    const { client_id, transaction_type, amount } = req.body;
    const query = 'INSERT INTO bmk_transactions (client_id, transaction_type, amount) VALUES (?, ?, ?)';
    const values = [client_id, transaction_type, amount];
  
    // Execute the SQL query
    pool.query(query, values, (err, result) => {
      if (err) {
        console.error('Error inserting data into bmk_transactions table: ', err);
        return;
      }
      console.log('Data inserted successfully');
      res.redirect('/transactions'); // Redirect to the homepage or any other page
    });
  });

// Define a route to fetch and display the transactions
app.get('/transactions', (req, res) => {
    const query = 'SELECT t.*, c.name AS client_name FROM bmk_transactions t JOIN bmkclients c ON t.client_id = c.id';
  
    // Execute the SQL query
    pool.query(query, (err, results) => {
      if (err) {
        console.error('Error fetching transactions: ', err);
        return;
      }
  
      let debitTotal = 0;
      let creditTotal = 0;
  
      results.forEach((transaction) => {
        if (transaction.transaction_type === 'debit') {
          debitTotal += +transaction.amount;
        } else if (transaction.transaction_type === 'credit') {
          creditTotal += +transaction.amount;
        }
      });
  
      // Render the transactions view and pass the transaction data and totals to the template
      res.render('showTransactions', {
        transactions: results,
        debitTotal: debitTotal.toFixed(2),
        creditTotal: creditTotal.toFixed(2)
      });
    });
  });




// Logout route
app.get('/logout', (req, res) => {
  // Destroy the session and logout the user
  req.session.destroy(err => {
    if (err) {
      console.log(err);
      res.redirect('/');
      return;
    }

    // Redirect the user to the desired page after successful logout
    res.redirect('/login');
  });
});

// Start the server
app.listen(3000, () => {
    console.log('Server started on port 3000');
});
