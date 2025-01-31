#!/bin/bash
export NODE_PATH=src/
export PUBLIC_URL=/
export REACT_APP_PLATFORM=localhost
export REACT_APP_TITLE=Bitfinex Reports
export REACT_APP_LOGO_PATH=favicon.ico

programname=$0
isDevEnv=0
ip=0

function usage {
  echo "Usage: $programname [-d] | [-i] | [-u] | [-h]"
  echo "  -d                 turn on developer environment"
  echo "  -i=XX.XX.XX.XX     adds ip as to run on an external network"
  echo "  -u=URL             adds URL as to run on an external network"
  echo "  -h                 display help"
  exit 1
}

while [ "$1" != "" ]; do
  case $1 in
    -d | --dev )    isDevEnv=1
                    ;;
    -i | --ip )    shift
                    ip=$1
                    ;;
    -u | --url )   shift
                    ip=$1
                    ;;
    -h | --help )   usage
                    exit
                    ;;
    * )             usage
                    exit 1
  esac
  shift
done

if [ $isDevEnv != 0 ]; then
  echo "Developer environment is turned on"
fi

if [ $ip != 0 ]; then
  echo "Ip is set to: $ip"
fi

frontendFolder="$PWD/bfx-report-ui"
expressFolder="$frontendFolder/bfx-report-express"
backendFolder="$PWD"


cd $frontendFolder
git stash
cd $backendFolder

git submodule sync
git submodule update --init --recursive
git pull --recurse-submodules
git submodule update --remote
npm i

cd $expressFolder
git submodule sync
git submodule update --init --recursive
git pull --recurse-submodules
git submodule update --remote

git stash
cd $frontendFolder
git submodule sync
git submodule update --init --recursive
git pull --recurse-submodules
git submodule update --remote
npm i

if [ $isDevEnv != 0 ]; then
	sed -i -e "s/KEY_URL: .*,/KEY_URL: \'https:\/\/test.bitfinex.com\/api\',/g" $frontendFolder/src/var/config.js
fi

if [ $ip != 0 ]; then
	sed -i -e "s/API_URL: .*,/API_URL: \'http:\/\/$ip:31339\/api\',/g" $frontendFolder/src/var/config.js
  sed -i -e "s/HOME_URL: .*,/HOME_URL: \'http:\/\/$ip:3000\',/g" $frontendFolder/src/var/config.js
fi

cp $expressFolder/config/default.json.example $expressFolder/config/default.json
sed -i -e "s/showSyncMode: .*,/showSyncMode: true,/g" $frontendFolder/src/var/config.js
sed -i -e "s/showFrameworkMode: .*,/showFrameworkMode: true,/g" $frontendFolder/src/var/config.js

cd $expressFolder
npm i

cd $backendFolder

cp .env.example bfx-report-ui/.env
cp config/schedule.json.example config/schedule.json
cp config/common.json.example config/common.json
cp config/service.report.json.example config/service.report.json
cp config/facs/grc.config.json.example config/facs/grc.config.json
sed -i -e "s/\"syncMode\": false/\"syncMode\": true/g" $backendFolder/config/service.report.json

if [ $isDevEnv != 0 ]; then
  sed -i -e "s/\"restUrl\": .*,/\"restUrl\": \"https:\/\/test.bitfinex.com\",/g" $backendFolder/config/service.report.json
fi

touch db/lokue_queue_1_aggregator.db.json
touch db/lokue_queue_1_processor.db.json
touch db/db-sqlite_sync_m0.db
