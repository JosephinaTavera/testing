const asyncErrorBoundary = require("../errors/asyncErrorBoundary");
const service = require("./reservations.service");

const VALID_RESERVATION_FIELDS = [
  "first_name",
  "last_name",
  "mobile_number",
  "reservation_date",
  "reservation_time",
  "people",
];

//helper function for validation
function _validateTime(str) {
  const [hour, minute] = str.split(":");

  if (hour.length > 2 || minute.length > 2) return false;
  if (hour < 1 || hour > 23) return false;
  if (minute < 0 || minute > 59) return false;

  return true;
}

//validation middleware
const reservationExists = async (req, res, next) => {
  const { reservation_Id } = req.params;
  const reservation = await service.read(reservation_Id);

  if (reservation) {
    res.locals.reservation = reservation;
    return next();
  }

  next({
    status: 404,
    message: `Reservation_id ${reservation_Id} does not exist.`,
  });
};

function isValidReservation(req, res, next) {
  const reservation = req.body.data;

  if (!reservation) {
    return next({ status: 400, message: `Must have data property.` });
  }

  VALID_RESERVATION_FIELDS.forEach((field) => {
    if (!reservation[field]) {
      return next({ status: 400, message: `${field} field required` });
    }
    if (field === "people" && typeof reservation[field] !== "number") {
      return next({
        status: 400,
        message: `${reservation[field]} is not a number type for people field.`,
      });
    }
    if (field === "reservation_date" && !Date.parse(reservation[field])) {
      return next({ status: 400, message: `${field} is not a valid date.` });
    }
    if (field === "reservation_time") {
      if (!_validateTime(reservation[field])) {
        return next({ status: 400, message: `${field} is not a valid time` });
      }
    }
  });

  next();
}

function isNotOnTuesday(req, res, next) {
  const { reservation_date } = req.body.data;
  const [year, month, day] = reservation_date.split("-");
  const date = new Date(`${month} ${day}, ${year}`);

  res.locals.date = date;

  if (date.getDay() === 2) {
    return next({ status: 400, message: "Location is closed on Tuesdays" });
  }

  next();
}

//jt
const timeFormat = /\d\d:\d\d/;

function asDateString(date) {
  return `${date.getFullYear().toString(10)}-${(date.getMonth() + 1)
    .toString(10)
    .padStart(2, "0")}-${date.getDate().toString(10).padStart(2, "0")}`;
}

function formatAsTime(timeString) {
  return timeString.match(timeFormat)[0];
}

function rightNow() {
  const now = new Date()
  const currentTime = `${('00' + now.getHours()).slice(-2)}:${('00' + now.getMinutes()).slice(-2)}:${now.getSeconds()}`
  return formatAsTime(currentTime)
}

function today() {
  return asDateString(new Date());
}

function isInTheFuture(req, res, next){
  const { data = {} } = req.body;
  const date = data['reservation_date']
  const time = data['reservation_time']

  if (isNaN(Date.parse(data['reservation_date']))){
      return next({ status: 400, message: `Invalid reservation_date` });
  }
  if(date < today()) {
    return next({status: 400, message: "Reservation must be set in the future"})
  }
  if(date === today() && time < rightNow()) {
    return next({status: 400, message: "Reservation must be set in the future"})
  }
  next();
}


// function isInTheFuture(req, res, next) {
//   const date = res.locals.date;
//   const today = new Date();

//   if (date < today) {
//     return next({ status: 400, message: "MUST be a future date" });
//   }
//   //jt
//   let now = new Date(); // This gets the machine's local time, but it's displayed as UTC.
//   let offset = now.getTimezoneOffset(); // This is the machine's timezone offset, in minutes.
//   let localTime = now.getTime() + (offset * 60000); // Date() returns milliseconds, so multiply by 60000 to get it in minutes. Add because UTC time is ahead.
  
//   if( localTime <= now)
//   {return next({ status: 400, message: "Must be a future date" }); }
//   //end
//   next();
// }

function isWithinOpenHours(req, res, next) {
  const reservation = req.body.data;
  const [hour, minute] = reservation.reservation_time.split(":");

  if (hour < 10 || hour > 21) {
    return next({
      status: 400,
      message: "Reservation must be made within business hours",
    });
  }
  if ((hour < 11 && minute < 30) || (hour > 20 && minute > 30)) {
    return next({
      status: 400,
      message: "Reservation must be made within business hours",
    });
  }

  next();
}

function hasBookedStatus(req, res, next) {
  const { status } = res.locals.reservation
    ? res.locals.reservation
    : req.body.data;

  if (status === "seated" || status === "finished" || status === "cancelled") {
    return next({
      status: 400,
      message: `New reservation can not have ${status} status.`,
    });
  }

  next();
}

function isValidStatus(req, res, next) {
  const VALID_STATUSES = ["booked", "seated", "finished", "cancelled"];
  const { status } = req.body.data;

  if (!VALID_STATUSES.includes(status)) {
    return next({ status: 400, message: "Status unknown." });
  }

  next();
}

function isAlreadyFinished(req, res, next) {
  const { status } = res.locals.reservation;

  if (status === "finished") {
    return next({
      status: 400,
      message: "Cannot change a reservation with a finished status.",
    });
  }

  next();
}

//CRUDL functions
async function create(req, res) {
  const reservation = req.body.data;
  const { reservation_id } = await service.create(reservation);

  reservation.reservation_id = reservation_id;
  res.status(201).json({ data: reservation });
}

async function read(req, res) {
  const reservation = res.locals.reservation;
  res.json({ data: reservation });
}

async function update(req, res, next) {
  const { reservation_Id } = req.params;
  const { status } = req.body.data;
  const reservation = await service.update(reservation_Id, status);

  res.json({ data: reservation });
}

async function modify(req, res, next) {
  const { reservation_Id } = req.params;
  const reservation = req.body.data;
  const data = await service.modify(reservation_Id, reservation);

  reservation.reservation_id = data.reservation_id;
  res.json({ data: reservation });
}

async function list(req, res) {
  const { date, mobile_number } = req.query;
  let reservations;

  if (mobile_number) {
    reservations = await service.search(mobile_number);
  } else {
    reservations = date ? await service.listByDate(date) : await service.list();
  }

  res.json({
    data: reservations,
  });
}

module.exports = {
  create: [
    asyncErrorBoundary(isValidReservation),
    isNotOnTuesday,
    isInTheFuture,
    isWithinOpenHours,
    hasBookedStatus,
    asyncErrorBoundary(create),
  ],
  read: [asyncErrorBoundary(reservationExists), asyncErrorBoundary(read)],
  update: [
    asyncErrorBoundary(reservationExists),
    isValidStatus,
    isAlreadyFinished,
    asyncErrorBoundary(update),
  ],
  modify: [
    isValidReservation,
    isNotOnTuesday,
    isInTheFuture,
    isWithinOpenHours,
    asyncErrorBoundary(reservationExists),
    hasBookedStatus,
    asyncErrorBoundary(modify),
  ],
  list: asyncErrorBoundary(list),
};