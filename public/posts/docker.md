How many times have you heard the argument, “But it works on my machine!”?

Docker is a solution to this problem. It uses a concept called containerization to package your code and run it across multiple machines.

Too complicated? In very simple words, Docker takes your code, packages it into an image (you can call this a portable unit). The image can be run on any machine that has Docker installed, creating an instance called a container. The packaging is done meticulously so that the other machine does not need to worry about installing dependencies, code breaks, or various operating system configurations.

Steps:
1. First, we add a Dockerfile and build an image. An image is a snapshot that "freezes" your app and its dependencies. Example:

```bash
docker build -t xeffect-backend:dev ./backend
```

2. We run the image, which creates a container from the image and runs the app as it was packaged. No extra manual effort needed. Example:

```bash
docker run --name xeffect-backend -p 4000:4000 xeffect-backend:dev
```

3. To confirm if the containers are running, we can use:

```bash
docker ps
```

4. To view logs for a running container, we can use:

```bash
docker logs xeffect-backend
```

5. Lastly, to stop the container, we can use:

```bash
docker stop xeffect-backend
```

However, if you are using full stack apps, it is highly recommended to create a docker-compose.yaml file and create services for frontend, backend, and database. It is highly flexible, and you can decide start order and service dependencies (note that `depends_on` controls order, not readiness).

In my project (see the repo here: `https://github.com/bhat0155/xeffect`) I used docker-compose.yaml. The concept remains the same.
To start the build, use:
```bash
docker compose up --build
```
To stop, use:
```bash
docker compose down
```
