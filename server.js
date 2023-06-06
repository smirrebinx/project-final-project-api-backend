import express from "express";
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

// Add middlewares to enable cors and json body parsing
app.use(
  cors({
    origin: "https://michelle-wegler-technigo-finalproject.netlify.app/", 
    methods: ["GET", "POST"], // Specify the allowed methods
    allowedHeaders: ["Content-Type", "Authorization"], // Specify the allowed headers
  })
); 
app.use(express.json());

// Defines endpoint paths as constants to be able to only update the paths in one place if needed
const PATHS = {
  root: "/",
  register: "/register",
  login: "/login",
  treatments: "/treatments",
  bookTreatment: "/book-treatment",
  userInfo: "/user-info"
}

// Start defining your routes here
app.get("/", (req, res) => {
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
  bookedTreatments: [{
    treatment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Treatment"
    }
  }]
});

UserSchema.index({ email: 1, mobilePhone: 1}, {unique: true });

const User = mongoose.model("User", UserSchema);

const TreatmentSchema = new mongoose.Schema({
cut: {
  type: String
}, 
wash: {
  type: String
}, 
cutAndWash: {
  type: String
},
styling: {
  type: String
}
});

const Treatment = mongoose.model("Treatment", TreatmentSchema);

// Create and save the treatments to the database
const treatments = [
  { cut: "Haircut" },
  { wash: "Hair wash" },
  { cutAndWash: "Haircut and wash" },
  { styling: "Hair styling" }
];

// Save treatmens to the database
treatments.forEach(async (treatmentData) => {
  try {
    const treatment = new Treatment(treatmentData);
    await treatment.save();
    console.log("Treatment created succesfully");
} catch (error) {
  console.error("Failed to create treatments", error)
};
});

// GET
app.get(PATHS.treatments, async (_, res) => {
  try {
    const treatments = await Treatment.find();
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
})

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
  const { treatmentId } = req.body;
  const userId = req.user._id;

  try {
    // Find the user and treatment by theri IDs
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

    // Create a new booking object
    const booking = {
      treatment: treatment._id
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

// Authenticate the user and return the user info page
app.get(PATHS.userInfo, async (req, res) => {
  const accessToken = req.header("Authorization");
  try {
    const user = await User.findOne({ accessToken: accessToken });
    if (user) {
      const secretMessage = "This is your user information";
      res.status(200).json({ secret: secretMessage });
    } else {
      res.status(401).json({
        success: false,
        response: "Please log in",
        loggedOut: true,
      });
    }
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
