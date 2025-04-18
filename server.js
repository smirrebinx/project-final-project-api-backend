import express, { json } from "express";
import cors from "cors";
import mongoose from "mongoose";
import crypto from "crypto";
import bcrypt from "bcrypt";
import listEndpoints from "express-list-endpoints";
import moment from 'moment-timezone';
import { body, validationResult } from 'express-validator';

const mongoUrl = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/final-project-api";
mongoose.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });
mongoose.Promise = Promise;

// Defines the port the app will run on. Defaults to 8080, but can be overridden
// when starting the server. Example command to overwrite PORT env variable value:
// PORT=9000 npm start
const port = process.env.PORT || 8080;
const app = express();

// Define the allowed origins
const allowedOrigins = [
"https://michelle-wegler-technigo-finalproject.netlify.app",
"http://localhost:3000",
"http://localhost:5173"
];

// Middleware function to handle CORS
const corsOptions = {
  origin: (origin, callback) => {
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
methods: ["GET", "POST"], // Specify the allowed methods
allowedHeaders: ["Content-Type", "Authorization"], // Specify the allowed headers
};

// Apply the CORS middleware
app.use(cors(corsOptions));
app.use(express.json());

// Defines endpoint paths as constants to be able to only update the paths in one place if needed
const PATHS = {
  root: "/",
  register: "/register",
  login: "/login",
  treatments: "/treatments",
  bookTreatment: "/booktreatment",
  bookedTreatment: "/bookedtreatment",
  userInfo: "/userinfo"
}

// Start defining your routes here
app.get(PATHS.root, (_,res) => {
  res.send(listEndpoints(app));
});

const validatePhone = (phone) => /^[0-9]{10,15}$/.test(phone);

const UserSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    minlength: 2,
    maxlength: 30
  },
  lastName: {
    type: String, 
    required: true, 
    minlength: 2,
    maxlength: 30
  },
  email: {
    type: String, 
    required: true,
    unique: true 
  },
  mobilePhone: {
    type: String,
    required: true,
    unique: true,
    validate: {
      validator: validatePhone,
      message: 'Mobile phone must be a number'
    }
  },
  password: {
    type: String,
    required: true
  },
  accessToken: {
    type: String,
    default: () => crypto.randomBytes(128).toString("hex")
  },
 bookedTreatments: [
    {
      bookedDate: {
        type: Date,
        required: true
      }
    }
  ]
});

UserSchema.index({ email: 1, mobilePhone: 1}, {unique: true });

const User = mongoose.model("User", UserSchema);

const TreatmentSchema = new mongoose.Schema({
  name: {
    type: String,
  }
});


const Treatment = mongoose.model("Treatment", TreatmentSchema);

(async () => {
  try {
    const createTreatments = async () => {
      const treatments = [
        { name: 'Haircut' },
        { name: 'Hair Dye' },
        { name: 'Haircut and Dye' },
        { name: 'Hair Styling'},
      ];

      try {
        // Fetch all existing treatments from the database
        const existingTreatments = await Treatment.find();

        for (const treatmentData of treatments) {
          // Check if the treatment already exists in the fetched treatments
          const existingTreatment = existingTreatments.find(
            (treatment) => treatment.name === treatmentData.name
          );

          if (!existingTreatment) {
            const treatment = new Treatment(treatmentData);
            await treatment.save();
          }
        }
      } catch (error) {
      }
    };

    await createTreatments(); // Call the function to execute the logic
  } catch (error) {
    console.error("Error occurred", error);
  }
})();


// GET 
app.get(PATHS.treatments, async (_, res) => {
  try {
    const treatments = await Treatment.find(); // Retrieve all treatments
    res.status(200).json({
      success: true,
      treatments: treatments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to retrieve treatments",
      error,
    });
  }
});

// Registration
app.post(PATHS.register,[
  // Validate first name
  body('firstName').isLength({ min: 2, max: 30 }).withMessage('First name must be between 2 and 30 characters'),
  // Validate last name
  body('lastName').isLength({ min:2, max: 30}).withMessage('Last name must be between 2 and 30 characters'),
  // Validate email
  body('email').isEmail().withMessage('Invalid email address').normalizeEmail(),
  // Validate mobile phone as a string that must match a certain pattern
  body('mobilePhone').isMobilePhone().withMessage('Invalid mobile phone number'),
  // Validate password length
  body('password').isLength({ min: 15, max: 20 }).withMessage('Password needs to be between 15 and 20 characters'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  
  const { firstName, lastName, email, mobilePhone, password } = req.body;
  
  try {
    const salt = bcrypt.genSaltSync(10); // The hashing algorithm will go through 10 rounds of iteration, making it more secure.
    // Do not store plaintext passwords
    const newUser = await new User({
      firstName, 
      lastName,
      email,
      mobilePhone,
      password: bcrypt.hashSync(password, salt)})
    .save();
    res.status(201).json({
      success: true,
      response: {
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        mobilePhone: newUser.mobilePhone, 
        id: newUser._id,
        accessToken: newUser.accessToken
      }
    })
  } catch (e) {
    // Bad request
    res.status(400).json({
      success: false,
      response: e,
      message: 'Could not create user', 
      errors: e.errors
    });
  }
});

// Login
app.post(PATHS.login,[
  // Validate that the email is in a correct format
  body('email').isEmail().withMessage('Enter a valid email address'),
  // Validate that the password is not empty
  body('password').not().isEmpty().withMessage('Password cannot be empty'), 
], async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  const { email, password } = req.body;

  try {
    const user = await User.findOne({email: email})
    if (user && bcrypt.compareSync(password, user.password)) {
      res.status(200).json({
        success: true,
        response: {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          mobilePhone: user.mobilePhone, 
          id: user._id,
          accessToken: user.accessToken
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid login credentials"
      });
    }
  } catch (e) {
    res.status(500).json({
      success: false,
      message: "An error occurred while attempting to login",
      error: e
    });
  }
});

// Authenticate the user
const authenticateUser = async (req, res, next) => {
  const accessToken = req.header("Authorization");
  try {
    const user = await User.findOne({accessToken: accessToken});
    if (user) {
      req.user = user; // Set the authenticated user object in the request
      next();
    } else {
      res.status(401).json({
        success: false,
        response: "Please log in",
        loggedOut: true
      })
    }
  } catch (e) {
    res.status(500).json({
      success: false,
      response: e
    });
  }
}

// Post the picked date
app.post(PATHS.bookTreatment, authenticateUser, async (req, res) => {
  const { pickedDate } = req.body;
  const userId = req.user._id;

  try {
    // Find the user by ID
    const user = await User.findById(userId);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    // Create a new booking object with the pickedDate
    const booking = {
      bookedDate: new Date(pickedDate),
    };

    // Add the booking to the user's bookedTreatments array
    user.bookedTreatments.push(booking);
    await user.save();

    res.status(200).json({
      success: true,
      message: "Treatment booked successfully",
      booking,
    });
  } catch (error) {
    console.log("Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to book treatment",
      error,
    });
  }
});


// Get the booked treatments for a user
app.get(PATHS.bookedTreatment, authenticateUser, async (req, res) => {
  try {
    const user = req.user;
    
    // Map over the bookedTreatments array and extract the date for each booking
    const bookedTreatments = user.bookedTreatments.map((booking) => {
      return {
        date: booking.bookedDate // Picked date
      };
    });

    res.status(200).json({
      success: true,
      message: "Booked treatments retrieved successfully",
      bookedTreatments: bookedTreatments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to retrieve booked treatments",
      error,
    });
  }
});

// Authenticate the user and return the user info page
app.get(PATHS.userInfo, authenticateUser, async (req, res) => {
  try {
    const user = req.user;
    const userInfo = "This is your user information";
    res.status(200).json({ success: true, message: userInfo, user });
  } catch (e) {
    res.status(500).json({
      success: false,
      response: e,
    });
  }
});

// Start the server
try {
  app.listen(port, () => {
    // Set the timezone to "Europe/London"
    moment.tz.setDefault('Europe/London');
    console.log(`Server running on http://localhost:${port}`);
  });
} catch (error) {
  console.error("Error occurred during server startup:", error);
}