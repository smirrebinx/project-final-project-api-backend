import express, { json } from "express";
import cors from "cors";
import mongoose from "mongoose";
import crypto from "crypto";
import bcrypt from "bcrypt";
import listEndpoints from "express-list-endpoints";

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
"http://localhost:3000"
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
  bookedTreatment: "/bookedTreatment",
  userInfo: "/userinfo"
}

// Start defining your routes here
app.get(PATHS.root, (_,res) => {
  res.send(listEndpoints(app));
});

const validatePhone = (value) => {
  if (typeof value !== 'number') {
    throw new Error('Mobile phone must be a number');
  }
};

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
    type: Number,
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
    treatment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Treatment',
    },
  },
],
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
        { name: 'Hair styling'},
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
            console.log("Treatment created successfully");
          }
        }
      } catch (error) {
        console.error("Failed to create treatments", error);
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
app.post(PATHS.register, async (req, res) => {
  const { firstName, lastName, email, mobilePhone, password } = req.body;
  if (password.length < 15 || password.length > 20) {
    res.status(400).json({success: false, message: "Password needs to be between 15 and 20 characters"})
  }
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
app.post(PATHS.login, async (req, res) => {
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
        response: "Credentials do not match"
      });
    }
  } catch (e) {
    res.status(500).json({
      success: false,
      response: e
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

app.post(PATHS.bookTreatment, authenticateUser, async (req, res) => {
  const { treatmentId, pickedDate } = req.body;
  const userId = req.user._id;

  try {
    // Find the user and treatment by their IDs
    const [user, treatment] = await Promise.all([
      User.findById(userId),
      Treatment.findById(treatmentId),
    ]);

    if (!user || !treatment) {
      res.status(404).json({
        success: false,
        message: "User or treatment not found",
      });
      return;
    }

    // Create a new booking object with treatmentId and pickedDate
    const booking = {
      treatment: treatment._id,
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
    await user.populate("bookedTreatments.treatment").execPopulate();

    res.status(200).json({
      success: true,
      message: "Booked treatments retrieved successfully",
      bookedTreatments: user.bookedTreatments,
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
    const secretMessage = "This is your user information";
    res.status(200).json({ success: true, message: secretMessage, user });
  } catch (e) {
    res.status(500).json({
      success: false,
      response: e,
    });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

// Test in postman

// Post: http://localhost:8080/register 
    // "firstName": "firstname",
    // "lastName": "lastname",
    // "email": "name@gmail.com",
    // "mobilePhone": "0000000000",
    // "password": "password"

// Post: http://localhost:8080/login
// {
//     "firstName": "name",
//     "password": "password"
// }

// Get   http://localhost:8080/user-info
// Headers: Authorization
// Enter accessToken in value

// Get   http://localhost:8080/treatments

// POST   http://localhost:8080/book-treatment
// Headers, Authorization, AccessToken from logged in user, treatmentid from get
// body, raw, json
// {
//     "treatmentId": ""
// }