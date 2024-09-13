# Android pipelines for dagger engine

Sample of a pipeline for building an Android application
```
dagger -m /www/dagger-deploy-tools/android call gradle --src . --command "./gradlew build" --export-directory "app/build/outputs" export --path ./compiled-apks
```

steps:

```
./gradlew clean bundle'+FLAVOUR+'Release
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -keystore /$KEYSTORE -storepass $KEYSTORE_PASS `find app/build/outputs/ -wholename "*.aab"` $KEYALIAS
java -jar /usr/bin/bundletool.jar build-apks --bundle=`find app/build/outputs/ -wholename "*.aab"` --output=`find app/build/outputs/ -wholename "*.aab" | grep -oP ".*(?=[.])"`.apks --overwrite --mode=universal --ks /$KEYSTORE --ks-key-alias ivoox --ks-pass=pass:$KEYSTORE_PASS
unzip `find -name "*.apks"` -d app/build/outputs/bundle
```
## Ionic

```
npm install
ionic capacitor build android --no-open --prod
cd android && ./gradlew assembleRelease
# results in /app/android/app/build/outputs/apk/release/app-release-unsigned.apk
```

## Tasks

### dagger:clean

Remove all generated files

```
docker rm --force --volumes "$(docker ps --quiet --filter='name=^dagger-engine-')"
```
