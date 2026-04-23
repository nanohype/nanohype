FROM eclipse-temurin:25-jdk AS build
WORKDIR /build
COPY pom.xml .
RUN mvn -B -q -DskipTests dependency:go-offline || true
COPY src ./src
RUN mvn -B -q -DskipTests package && \
    cp target/__ARTIFACT_ID__.jar /build/app.jar

FROM eclipse-temurin:25-jre
WORKDIR /app
RUN addgroup --system app && adduser --system --ingroup app app
COPY --from=build /build/app.jar app.jar
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-XX:+UseZGC", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
