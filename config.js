const yaml = require('js-yaml');
const fs   = require('fs');

exports.parse = function () {
    const file = process.env.CONFIG || './config/config.yaml';
    if (fs.existsSync(file)) {
        try {
          return yaml.load(fs.readFileSync(file, 'utf8'));
        } catch (e) {
          console.log(e);
          process.exit();
        }
    } else {
        console.log('Unable to load config.yaml. Exiting.');
        process.exit();
    }
}
