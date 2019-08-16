const csv = require("csv");
const prompt = require("prompt");
const fs = require("fs");
const path = require("path");

const map = require("./map.json");

var data = {
  csvData: [],
  errors: {},
  QuestionnaireResponses: [],
  fileDate: "",
  loadCsv: function(rawData) {
    var promise = new Promise(function(resolve, reject) {
      csv.parse(
        rawData,
        {
          columns: true,
          trim: true,
          skip_empty_lines: true
        },
        function(err, output) {
          resolve(output);
        }
      );
    });
    return promise;
  },
  convertToQR: function() {
    this.checkHeaders(this.csvData[0]);
    for (let i = 0; i < this.csvData.length; i++) {
      var QR = {
        resourceType: "QuestionnaireResponse",
        id: this.fileDate + "-row" + i,
        item: []
      };
      var pathsChecked = {};
      Object.keys(this.csvData[i]).forEach(key => {
        this.evaluateValue(this.csvData[i][key], map['map'][key]["valueType"], i, key);
        var tempValue = this.csvData[i][key];
        if (map['map'][key]["valueType"] == "choice") {
          tempValue = this.convertValue(
            tempValue,
            map['map'][key]["choiceMap"],
            i,
            key
          );
        }
        this.addQRItems(
          QR["item"],
          map['map'][key]["path"],
          pathsChecked,
          tempValue,
          map['map'][key]["valueType"].charAt(0).toUpperCase() +
            map['map'][key]["valueType"].slice(1)
        );
      });
      if (!this.errors.hasOwnProperty(i)) {
        this.QuestionnaireResponses.push(QR);
      }
    }
  },
  checkHeaders: function(firstRow) {
    //we can prep using the first row because the csv parser requires csv to be internally consistent (each row must have as many entries as header row)
    var invalidHeaders = [];
    Object.keys(firstRow).forEach(key => {
      if (!map['map'].hasOwnProperty(key)) {
        invalidHeaders.push(key);
      }
    });
    if (invalidHeaders.length > 0) {
      console.log(
        "The following headers are not mapped: " + invalidHeaders.join()
      );
      throw new Error("Invalid Headers");
    }
  },
  evaluateValue: function(value, valueType, row, key) {
    //this function would evaluate value and push an error to this.errors if invalid
  },
  convertValue: function(value, valueMapLocation, row, key) {
    //if there is an error in mapping the value (e.g. map missing, then push error), else convert
    try {
      var valueMap = require("./" + valueMapLocation);
      if (valueMap[value] === undefined) {
        throw new Error("Unmapped choice value");
      }
      return valueMap[value];
    } catch (e) {
      if (!this.errors.hasOwnProperty(row)) {
        this.errors[row] = {};
      }
      if (!this.errors[row].hasOwnProperty(key)) {
        this.errors[row][key] = {};
      }
      this.errors[row][key]["invalidValueMapping"] = true;
    }
  },
  addQRItems: function(tempObject, pathArray, pathsChecked, value, valueType) {
    var indexPosition = 0;
    if (!pathsChecked.hasOwnProperty(pathArray[0]["linkid"])) {
      pathsChecked[pathArray[0]["linkid"]] = {};
      var newItem = {};

      newItem["linkId"] = pathArray[0]["linkid"];
      newItem["text"] = pathArray[0]["text"];
      if (pathArray.length > 1) {
        newItem["item"] = [];
      }

      tempObject.push(newItem);
    }

    //find the appropriate index position for the given linkID
    for (let i = 0; i < tempObject.length; i++) {
      if (pathArray[0]["linkid"] == tempObject[i]["linkId"]) {
        indexPosition = i;
        break;
      }
    }
    //call recursively if not last item in path, otherwise push value
    if (pathArray.length > 1) {
      this.addQRItems(
        tempObject[indexPosition]["item"],
        pathArray.slice(1),
        pathsChecked[pathArray[0]["linkid"]],
        value,
        valueType
      );
    } else {
      tempObject[indexPosition]["answer"] = {};
      var valueName = "value" + valueType;
      tempObject[indexPosition]["answer"][valueName] = value;
    }
  }
};

//Object: for prompt of file name
var promptSchema = {
  properties: {
    fileName: {
      description:
        "Please enter the name of your file; do not include .csv extension",
      required: true
    }
  }
};

getFileName().then(result => {
  var rawData = bufferFile(result["fileName"] + ".csv");
  var uploadDate = new Date().toISOString();
  data.fileDate = result["fileName"] + "-" + uploadDate;
  data
    .loadCsv(rawData)
    .then(output => {
      if (output === undefined) {
        throw new Error("CSV File is Invalid");
      }
      data.csvData = output;
      data.convertToQR();
      saveFile(
        result["fileName"] + "_QuestionnaireResponse",
        JSON.stringify(data["QuestionnaireResponses"], null, 3),
        "json"
      );
      saveFile(
        result["fileName"] + "_Errors",
        JSON.stringify(data["errors"], null, 3),
        "json"
      );
    })
    .catch(e => {
      console.log(e);
    });
});

//-----------------------------------------------------------------------

//FUNCTIONS

//FUNCTION to open file
function bufferFile(relPath) {
  return fs.readFileSync(path.join(__dirname, relPath));
}

//FUNCTION to get file name

function getFileName() {
  var promise = new Promise(function(resolve, reject) {
    prompt.start();

    prompt.get(promptSchema, function(err, result) {
      if (err) {
        return onErr(err);
      }
      resolve(result);
    });

    function onErr(err) {
      console.log(err);
      return 1;
      process.exit();
    }
  });
  return promise;
}

//FUNCTION to write file

function saveFile(fileName, data, fileType) {
  fs.writeFileSync(fileName + "." + fileType, data);
}