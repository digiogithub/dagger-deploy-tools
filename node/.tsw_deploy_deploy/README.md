# Dagger deploy

This code need [Dagger Engine installed](https://docs.dagger.io/quickstart/cli/) and Docker 

## Extensions installed

```
dagger install github.com/sagikazarmark/daggerverse/archivist@v0.5.0
```

## Generating build files

Run in terminal, the code build will be exported to `./exported` folder

```
dagger call buildBackend --source=. export --path=./exported
```

Export build file as tgz

```
dagger call export-tgz --source=. export --path=./archive.tgz
```